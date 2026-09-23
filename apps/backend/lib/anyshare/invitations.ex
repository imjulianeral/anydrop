defmodule Anyshare.Invitations do
  @moduledoc false
  import Ecto.Query

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.Accounts.Invitation
  alias Anyshare.Repo
  alias Anyshare.RoomEvents
  alias Anyshare.Time

  def list(device) do
    now = Time.now()

    Repo.all(
      from i in Invitation,
        where: i.sender_id == ^device.id or i.recipient_id == ^device.id,
        where: i.status == "accepted" or (i.status == "pending" and i.expires_at > ^now),
        order_by: [asc: i.inserted_at],
        preload: [:sender, :recipient]
    )
  end

  def connected_ids(device_id) do
    Repo.all(
      from i in Invitation,
        where:
          i.status == "accepted" and (i.sender_id == ^device_id or i.recipient_id == ^device_id),
        select: {i.sender_id, i.recipient_id}
    )
    |> Enum.map(fn {sender, recipient} -> if sender == device_id, do: recipient, else: sender end)
  end

  def create(sender, target) when is_binary(target) do
    with {:ok, recipient} <- find_target(String.trim(target)),
         :ok <- can_invite(sender, recipient) do
      result =
        Repo.transaction(fn ->
          # Serialize both directions of a pair, including the first invitation.
          ids = Enum.sort([sender.id, recipient.id])
          Repo.all(from d in Device, where: d.id in ^ids, order_by: d.id, lock: "FOR UPDATE")
          existing = Repo.one(pair_query(sender.id, recipient.id))
          check_existing(existing)
          check_rate(sender.id)

          attrs = %{
            sender_id: sender.id,
            recipient_id: recipient.id,
            status: "pending",
            expires_at: NaiveDateTime.add(Time.now(), 600)
          }

          (existing || %Invitation{id: Ecto.UUID.generate()})
          |> Ecto.Changeset.cast(attrs, [:sender_id, :recipient_id, :status, :expires_at])
          |> Repo.insert_or_update!()
          |> Repo.preload([:sender, :recipient], force: true)
        end)

      publish(result)
    end
  end

  def create(_sender, _target), do: {:error, :invalid_target}

  def respond(device, id, action) when action in ["accept", "decline", "disconnect"] do
    result =
      Repo.transaction(fn ->
        invitation = Repo.one(from i in Invitation, where: i.id == ^id, lock: "FOR UPDATE")
        if is_nil(invitation), do: Repo.rollback(:not_found)

        if action == "disconnect" do
          if device.id not in [invitation.sender_id, invitation.recipient_id],
            do: Repo.rollback(:not_found)
        else
          if device.id != invitation.recipient_id, do: Repo.rollback(:not_found)
        end

        status = response_status(invitation, action)

        invitation
        |> Ecto.Changeset.change(status: status)
        |> Repo.update!()
        |> Repo.preload([:sender, :recipient])
      end)

    publish(result)
  end

  def respond(_device, _id, _action), do: {:error, :invalid_action}

  def json(invitation) do
    %{
      id: invitation.id,
      status: invitation.status,
      sender: Accounts.peer_json(invitation.sender),
      recipient: Accounts.peer_json(invitation.recipient),
      expires_at: Time.iso8601(invitation.expires_at)
    }
  end

  defp find_target(target) when byte_size(target) in 1..160 do
    case Repo.get(Device, target) do
      nil ->
        case Repo.all(from d in Device, where: d.display_name == ^target, limit: 2) do
          [] -> {:error, :not_found}
          [device] -> {:ok, device}
          _ -> {:error, :ambiguous}
        end

      device ->
        {:ok, device}
    end
  end

  defp find_target(_target), do: {:error, :invalid_target}

  defp can_invite(sender, recipient) do
    cutoff = NaiveDateTime.add(Time.now(), -120)

    cond do
      sender.id == recipient.id -> {:error, :self_invite}
      NaiveDateTime.compare(recipient.last_seen_at, cutoff) == :lt -> {:error, :offline}
      true -> :ok
    end
  end

  defp pair_query(first, second) do
    from i in Invitation,
      where:
        (i.sender_id == ^first and i.recipient_id == ^second) or
          (i.sender_id == ^second and i.recipient_id == ^first)
  end

  defp check_existing(nil), do: :ok
  defp check_existing(%{status: "accepted"}), do: Repo.rollback(:already_connected)

  defp check_existing(invitation) do
    if invitation.status == "pending" and
         NaiveDateTime.compare(invitation.expires_at, Time.now()) == :gt,
       do: Repo.rollback(:already_pending)

    if NaiveDateTime.diff(Time.now(), invitation.updated_at) < 60,
      do: Repo.rollback(:rate_limited)
  end

  defp check_rate(sender_id) do
    cutoff = NaiveDateTime.add(Time.now(), -60)

    count =
      Repo.aggregate(
        from(i in Invitation, where: i.sender_id == ^sender_id and i.updated_at > ^cutoff),
        :count
      )

    if count >= 10, do: Repo.rollback(:rate_limited)
  end

  defp response_status(%{status: "accepted"}, "disconnect"), do: "disconnected"

  defp response_status(%{status: "pending"} = invitation, action)
       when action in ["accept", "decline"] do
    if NaiveDateTime.compare(invitation.expires_at, Time.now()) != :gt,
      do: Repo.rollback(:expired)

    if action == "accept", do: "accepted", else: "declined"
  end

  defp response_status(_invitation, _action), do: Repo.rollback(:already_answered)

  defp publish({:ok, invitation} = result) do
    for id <- [invitation.sender_id, invitation.recipient_id] do
      RoomEvents.notify_device(id, "invitation_updated", %{invitation: json(invitation)})
    end

    result
  end

  defp publish(error), do: error
end
