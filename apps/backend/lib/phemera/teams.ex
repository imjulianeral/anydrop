defmodule Phemera.Teams do
  @moduledoc """
  Enterprise teams. An enterprise account owns one team and invites people by
  email; the link in that email lets them create an account and join. Members
  can reach every other member's saved devices from anywhere.
  """
  import Ecto.Query

  alias Phemera.Accounts
  alias Phemera.Accounts.Device
  alias Phemera.Auth
  alias Phemera.Auth.User
  alias Phemera.Mailer
  alias Phemera.Repo
  alias Phemera.RoomEvents
  alias Phemera.Teams.Invitation
  alias Phemera.Teams.Member
  alias Phemera.Teams.Team

  @plans ~w(free enterprise)
  @invite_seconds 7 * 24 * 60 * 60
  @invites_per_hour 50
  @max_members 200
  @max_email_bytes 254
  @email ~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
  @group_prefix "team:"

  @spec teammate_ids(Ecto.UUID.t()) :: [Ecto.UUID.t()]
  def teammate_ids(user_id) do
    Repo.all(
      from m in Member,
        join: other in Member,
        on: other.team_id == m.team_id,
        where: m.user_id == ^user_id and other.user_id != ^user_id,
        select: other.user_id
    )
  end

  @doc "The person's team and role, or nil."
  @spec membership(User.t() | Ecto.UUID.t() | nil) :: {Team.t(), String.t()} | nil
  def membership(nil), do: nil
  def membership(%User{id: id}), do: membership(id)

  def membership(user_id) do
    Repo.one(
      from m in Member,
        join: t in assoc(m, :team),
        where: m.user_id == ^user_id,
        select: {t, m.role}
    )
  end

  @doc "The team with members and, for its owner, the pending invitations."
  def get(user) do
    case membership(user) do
      nil ->
        nil

      {team, role} ->
        members =
          Repo.all(
            from m in Member,
              where: m.team_id == ^team.id,
              order_by: [asc: m.inserted_at],
              preload: [:user]
          )

        invitations = if role == "owner", do: pending_invitations(team), else: []
        %{team: team, role: role, members: members, invitations: invitations}
    end
  end

  def create(%User{plan: "enterprise"} = user, name) do
    with {:ok, name} <- normalize_team_name(name) do
      Repo.transaction(fn ->
        if membership(user), do: Repo.rollback(:already_in_team)
        team = Repo.insert!(%Team{name: name, owner_id: user.id})
        Repo.insert!(%Member{team_id: team.id, user_id: user.id, role: "owner"})
        team
      end)
    end
  end

  def create(_user, _name), do: {:error, :not_enterprise}

  def rename(user, name) do
    with {:ok, name} <- normalize_team_name(name),
         {:ok, team} <- owned_team(user) do
      team |> Ecto.Changeset.change(name: name) |> Repo.update()
    end
  end

  @doc """
  Creates an invitation and emails it. Returns the link too, so the owner can
  pass it on another way if the email never arrives.
  """
  def invite(user, email) do
    with {:ok, email} <- normalize_email(email),
         {:ok, team} <- owned_team(user) do
      token = Accounts.issue_token()

      result =
        Repo.transaction(fn ->
          Repo.one!(from t in Team, where: t.id == ^team.id, lock: "FOR UPDATE")
          if member_email?(team, email), do: Repo.rollback(:already_member)
          if member_count(team) >= @max_members, do: Repo.rollback(:team_full)
          check_rate(user.id)

          from(i in Invitation,
            where: i.team_id == ^team.id and i.email == ^email and i.status == "pending"
          )
          |> Repo.update_all(set: [status: "revoked", updated_at: DateTime.utc_now()])

          Repo.insert!(%Invitation{
            team_id: team.id,
            email: email,
            token_digest: Accounts.digest(token),
            invited_by_id: user.id,
            status: "pending",
            expires_at: DateTime.add(DateTime.utc_now(), @invite_seconds)
          })
        end)

      with {:ok, invitation} <- result do
        url = invitation_url(token)
        Mailer.deliver_later(Mailer.Emails.team_invitation(invitation, team, user, url))
        {:ok, invitation, url}
      end
    end
  end

  def revoke_invitation(user, id) do
    with {:ok, team} <- owned_team(user),
         {:ok, id} <- Ecto.UUID.cast(id) do
      case from(i in Invitation,
             where: i.id == ^id and i.team_id == ^team.id and i.status == "pending"
           )
           |> Repo.update_all(set: [status: "revoked", updated_at: DateTime.utc_now()]) do
        {1, _} -> :ok
        _ -> {:error, :not_found}
      end
    else
      :error -> {:error, :not_found}
      error -> error
    end
  end

  @doc "What the join page shows before anyone signs in."
  def preview(token) do
    with {:ok, invitation} <- live_invitation(token) do
      invitation = Repo.preload(invitation, [:team, :invited_by])

      {:ok,
       %{
         team: invitation.team.name,
         invited_by: invitation.invited_by && invitation.invited_by.name,
         email: mask_email(invitation.email),
         expires_at: invitation.expires_at
       }}
    end
  end

  @doc "Joins the team. The emailed token is the proof, and it works once."
  def accept(user, token) do
    Repo.transaction(fn ->
      invitation =
        case live_invitation(token, lock: true) do
          {:ok, invitation} -> invitation
          {:error, reason} -> Repo.rollback(reason)
        end

      case membership(user) do
        nil ->
          Repo.insert!(%Member{team_id: invitation.team_id, user_id: user.id, role: "member"})

        {%Team{id: team_id}, _role} when team_id == invitation.team_id ->
          :ok

        _other ->
          Repo.rollback(:already_in_team)
      end

      invitation
      |> Ecto.Changeset.change(status: "accepted", accepted_by_id: user.id)
      |> Repo.update!()

      if is_nil(user.email) do
        user |> Ecto.Changeset.change(email: invitation.email) |> Repo.update!()
      end

      Repo.get!(Team, invitation.team_id)
    end)
    |> tap(fn
      {:ok, team} -> notify_team(team.id)
      _ -> :ok
    end)
  end

  def remove_member(user, member_id) do
    with {:ok, team} <- owned_team(user),
         true <- member_id != user.id || {:error, :owner_cannot_leave},
         {:ok, member_id} <- Ecto.UUID.cast(member_id) |> ok_or_not_found() do
      # Notify before removing so the member's devices hear about it too.
      devices = team_device_ids(team.id)

      case from(m in Member, where: m.team_id == ^team.id and m.user_id == ^member_id)
           |> Repo.delete_all() do
        {1, _} ->
          notify(devices)
          :ok

        _ ->
          {:error, :not_found}
      end
    end
  end

  def leave(user) do
    case membership(user) do
      nil ->
        {:error, :not_found}

      {_team, "owner"} ->
        {:error, :owner_cannot_leave}

      {team, _role} ->
        devices = team_device_ids(team.id)
        Repo.delete_all(from m in Member, where: m.team_id == ^team.id and m.user_id == ^user.id)
        notify(devices)
        :ok
    end
  end

  def delete(user) do
    with {:ok, team} <- owned_team(user) do
      devices = team_device_ids(team.id)
      Repo.delete!(team)
      notify(devices)
      :ok
    end
  end

  @doc "Sets an account's plan. Operators run it through `Phemera.Release.set_plan/2`."
  def set_plan(%User{} = user, plan) when plan in @plans,
    do: user |> Ecto.Changeset.change(plan: plan) |> Repo.update()

  def set_plan(_user, _plan), do: {:error, :invalid_plan}

  # Team broadcast group

  @doc "The team as a read-only group of every member's saved devices."
  def group_for(%Device{user_id: nil}), do: nil

  def group_for(%Device{user_id: user_id}) do
    case membership(user_id) do
      nil ->
        nil

      {team, _role} ->
        %{
          id: @group_prefix <> team.id,
          name: team.name,
          owner_id: nil,
          kind: "team",
          members: team_devices(team.id)
        }
    end
  end

  @spec group_id?(term()) :: boolean()
  def group_id?(id), do: is_binary(id) and String.starts_with?(id, @group_prefix)

  @doc "Whether a team group id belongs to this device's team."
  def group_member?(%Device{} = device, group_id) do
    case group_for(device) do
      %{id: ^group_id} -> true
      _ -> false
    end
  end

  @doc "A teammate's device in the team group, for a group transfer."
  def group_recipient(%Device{} = sender, group_id, recipient_id) when is_binary(recipient_id) do
    with %{id: ^group_id, members: members} <- group_for(sender),
         %Device{} = recipient <- Enum.find(members, &(&1.id == recipient_id)),
         false <- recipient.id == sender.id do
      recipient
    else
      _ -> nil
    end
  end

  def group_recipient(_sender, _group_id, _recipient_id), do: nil

  # JSON

  def json(%{team: team, role: role, members: members, invitations: invitations}) do
    %{
      id: team.id,
      name: team.name,
      role: role,
      members:
        Enum.map(members, fn member ->
          %{
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
            role: member.role,
            joined_at: member.inserted_at
          }
        end),
      invitations: Enum.map(invitations, &invitation_json/1)
    }
  end

  def invitation_json(invitation) do
    %{
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expires_at: invitation.expires_at,
      created_at: invitation.inserted_at
    }
  end

  def summary_json(nil), do: nil
  def summary_json({team, role}), do: %{id: team.id, name: team.name, role: role}

  # Helpers

  defp owned_team(user) do
    case membership(user) do
      {team, "owner"} -> {:ok, team}
      {_team, _role} -> {:error, :forbidden}
      nil -> {:error, :not_found}
    end
  end

  defp live_invitation(token, opts \\ [])

  defp live_invitation(token, opts) when is_binary(token) and byte_size(token) == 64 do
    now = DateTime.utc_now()

    query =
      from i in Invitation,
        where: i.token_digest == ^Accounts.digest(token),
        where: i.status == "pending" and i.expires_at > ^now

    query = if opts[:lock], do: lock(query, "FOR UPDATE"), else: query

    case Repo.one(query) do
      nil -> {:error, :invalid_invitation}
      invitation -> {:ok, invitation}
    end
  end

  defp live_invitation(_token, _opts), do: {:error, :invalid_invitation}

  defp pending_invitations(team) do
    now = DateTime.utc_now()

    Repo.all(
      from i in Invitation,
        where: i.team_id == ^team.id and i.status == "pending" and i.expires_at > ^now,
        order_by: [desc: i.inserted_at]
    )
  end

  defp member_email?(team, email) do
    Repo.exists?(
      from m in Member,
        join: u in assoc(m, :user),
        where: m.team_id == ^team.id and fragment("lower(?)", u.email) == ^email
    )
  end

  defp member_count(team),
    do: Repo.aggregate(from(m in Member, where: m.team_id == ^team.id), :count)

  defp check_rate(user_id) do
    cutoff = DateTime.add(DateTime.utc_now(), -3600)

    count =
      Repo.aggregate(
        from(i in Invitation, where: i.invited_by_id == ^user_id and i.inserted_at > ^cutoff),
        :count
      )

    if count >= @invites_per_hour, do: Repo.rollback(:rate_limited)
  end

  defp team_devices(team_id) do
    Repo.all(
      from d in Device,
        join: m in Member,
        on: m.user_id == d.user_id,
        where: m.team_id == ^team_id,
        order_by: [asc: d.display_name]
    )
  end

  defp team_device_ids(team_id), do: team_id |> team_devices() |> Enum.map(& &1.id)

  defp notify_team(team_id), do: team_id |> team_device_ids() |> notify()

  defp notify(device_ids) do
    for id <- device_ids do
      RoomEvents.notify_device(id, "peers_changed", %{})
      RoomEvents.notify_device(id, "groups_updated", %{})
    end

    :ok
  end

  defp invitation_url(token), do: Auth.origin() <> "/join/" <> token

  defp normalize_team_name(name), do: Auth.normalize_name(name)

  @spec normalize_email(term()) :: {:ok, String.t()} | {:error, :invalid_email}
  def normalize_email(email) when is_binary(email) do
    email = email |> String.trim() |> String.downcase()

    if byte_size(email) <= @max_email_bytes and Regex.match?(@email, email),
      do: {:ok, email},
      else: {:error, :invalid_email}
  end

  def normalize_email(_email), do: {:error, :invalid_email}

  defp mask_email(email) do
    case String.split(email, "@", parts: 2) do
      [local, domain] -> String.first(local) <> "•••@" <> domain
      _ -> "•••"
    end
  end

  defp ok_or_not_found({:ok, value}), do: {:ok, value}
  defp ok_or_not_found(:error), do: {:error, :not_found}
end
