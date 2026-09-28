defmodule Phemera.DeviceOwnership do
  @moduledoc """
  Links devices to accounts. A device becomes someone's either because they
  saved it while signed in on it, or because they asked from a nearby device
  and the target device confirmed on its own screen. Signing in never claims
  a device by itself, so borrowing a friend's browser leaves it untouched.
  """
  import Ecto.Query

  alias Phemera.Accounts
  alias Phemera.Accounts.Device
  alias Phemera.Accounts.DeviceClaim
  alias Phemera.Auth.User
  alias Phemera.Repo
  alias Phemera.RoomEvents
  alias Phemera.Time

  @claim_seconds 600
  @claims_per_minute 10
  @max_name_length 40

  @type status :: :mine | :unsaved | :other_account

  @spec status(User.t(), Device.t()) :: status()
  def status(%User{id: id}, %Device{user_id: id}), do: :mine
  def status(_user, %Device{user_id: nil}), do: :unsaved
  def status(_user, _device), do: :other_account

  @spec list_owned(User.t()) :: [Device.t()]
  def list_owned(user) do
    Repo.all(
      from d in Device,
        where: d.user_id == ^user.id,
        order_by: [desc_nulls_last: d.last_seen_at, asc: d.display_name]
    )
  end

  @doc "Saves the device the person is signed in on. No prompt: they hold both keys."
  def save_current(user, device, name) do
    with {:ok, name} <- normalize_name(name || device.display_name) do
      Repo.transaction(fn ->
        device = lock_device(device.id)
        if status(user, device) == :other_account, do: Repo.rollback(:other_account)
        own!(device, user, name)
      end)
      |> announce(user)
    end
  end

  @doc """
  Asks a nearby, unsaved device to join the account. The target has to accept
  on its own screen; until then nothing changes.
  """
  def request_claim(user, requester, target_id, name) do
    with {:ok, name} <- normalize_name(name),
         %Device{} = target <- Accounts.nearby_peer(requester, target_id) || {:error, :not_found} do
      Repo.transaction(fn ->
        target = lock_device(target.id)

        case status(user, target) do
          :mine -> Repo.rollback(:already_mine)
          :other_account -> Repo.rollback(:other_account)
          :unsaved -> :ok
        end

        check_rate(user.id)
        clear_pending(target.id, user.id)

        %DeviceClaim{id: Ecto.UUID.generate()}
        |> Ecto.Changeset.change(
          user_id: user.id,
          target_device_id: target.id,
          requested_by_device_id: requester.id,
          name: name,
          status: "pending",
          expires_at: NaiveDateTime.add(now(), @claim_seconds)
        )
        |> Repo.insert!()
        |> preload_claim()
      end)
      |> publish()
    end
  end

  @doc "The target device's answer. Accepting saves it to the requester's account."
  def respond_claim(device, id, action) when action in ["accept", "decline"] do
    Repo.transaction(fn ->
      claim = lock_claim(id)
      if claim.target_device_id != device.id, do: Repo.rollback(:not_found)
      check_pending(claim)

      if action == "accept" do
        target = lock_device(device.id)
        owner = Repo.get!(User, claim.user_id)
        if status(owner, target) == :other_account, do: Repo.rollback(:other_account)
        own!(target, owner, claim.name)
      end

      claim
      |> Ecto.Changeset.change(status: if(action == "accept", do: "accepted", else: "declined"))
      |> Repo.update!()
      |> preload_claim()
    end)
    |> publish()
    |> tap(fn
      {:ok, %DeviceClaim{status: "accepted"} = claim} ->
        announce({:ok, claim.target_device}, claim.user)

      _ ->
        :ok
    end)
  end

  def respond_claim(_device, _id, _action), do: {:error, :invalid_action}

  def cancel_claim(user, id) do
    Repo.transaction(fn ->
      claim = lock_claim(id)
      if claim.user_id != user.id, do: Repo.rollback(:not_found)
      check_pending(claim)

      claim
      |> Ecto.Changeset.change(status: "cancelled")
      |> Repo.update!()
      |> preload_claim()
    end)
    |> publish()
  end

  @doc "Pending requests waiting for this device to answer."
  def pending_for_device(device) do
    now = Time.now()

    Repo.all(
      from c in DeviceClaim,
        where: c.target_device_id == ^device.id,
        where: c.status == "pending" and c.expires_at > ^now,
        order_by: [asc: c.inserted_at],
        preload: [:user, :target_device, :requested_by_device]
    )
  end

  @doc "Requests this account sent that the target has not answered yet."
  def pending_for_user(user) do
    now = Time.now()

    Repo.all(
      from c in DeviceClaim,
        where: c.user_id == ^user.id,
        where: c.status == "pending" and c.expires_at > ^now,
        order_by: [asc: c.inserted_at],
        preload: [:user, :target_device, :requested_by_device]
    )
  end

  def rename(user, device_id, name) do
    with {:ok, name} <- normalize_name(name) do
      Repo.transaction(fn ->
        device = lock_owned(user, device_id)

        device
        |> Ecto.Changeset.change(display_name: name)
        |> Repo.update!()
      end)
      |> announce(user)
    end
  end

  def remove(user, device_id) do
    Repo.transaction(fn ->
      device = lock_owned(user, device_id)

      device
      |> Ecto.Changeset.change(user_id: nil, saved_at: nil)
      |> Repo.update!()
    end)
    |> announce(user)
  end

  @spec device_json(Device.t()) :: map()
  def device_json(device) do
    device
    |> Accounts.peer_json("mine")
    |> Map.merge(%{
      online: Accounts.online?(device),
      saved_at: device.saved_at && Time.iso8601(device.saved_at)
    })
  end

  @spec claim_json(DeviceClaim.t()) :: map()
  def claim_json(claim) do
    %{
      id: claim.id,
      name: claim.name,
      status: claim.status,
      expires_at: Time.iso8601(claim.expires_at),
      requester: %{name: claim.user.name},
      requested_by: claim.requested_by_device && Accounts.peer_json(claim.requested_by_device),
      target: Accounts.peer_json(claim.target_device)
    }
  end

  @spec normalize_name(term()) :: {:ok, String.t()} | {:error, :invalid_name}
  def normalize_name(name) when is_binary(name) do
    name = String.trim(name)
    length = String.length(name)

    if length >= 1 and length <= @max_name_length and String.printable?(name),
      do: {:ok, name},
      else: {:error, :invalid_name}
  end

  def normalize_name(_name), do: {:error, :invalid_name}

  defp own!(device, user, name) do
    pending = from(c in DeviceClaim, where: c.target_device_id == ^device.id)

    Repo.update_all(where(pending, [c], c.status == "pending" and c.user_id != ^user.id),
      set: [status: "cancelled", updated_at: now()]
    )

    device
    |> Ecto.Changeset.change(
      user_id: user.id,
      saved_at: if(device.user_id == user.id, do: device.saved_at, else: now()),
      display_name: name
    )
    |> Repo.update!()
  end

  # Claim and ownership timestamps are stored with microsecond precision.
  defp now, do: %{Time.now() | microsecond: {0, 6}}

  defp lock_device(id) do
    Repo.one(from d in Device, where: d.id == ^id, lock: "FOR UPDATE") ||
      Repo.rollback(:not_found)
  end

  defp lock_owned(user, id) when is_binary(id) do
    Repo.one(from d in Device, where: d.id == ^id and d.user_id == ^user.id, lock: "FOR UPDATE") ||
      Repo.rollback(:not_found)
  end

  defp lock_owned(_user, _id), do: Repo.rollback(:not_found)

  defp lock_claim(id) when is_binary(id) do
    Repo.one(from c in DeviceClaim, where: c.id == ^id, lock: "FOR UPDATE") ||
      Repo.rollback(:not_found)
  end

  defp lock_claim(_id), do: Repo.rollback(:not_found)

  defp check_pending(%DeviceClaim{status: "pending"} = claim) do
    if NaiveDateTime.compare(claim.expires_at, Time.now()) != :gt, do: Repo.rollback(:expired)
    :ok
  end

  defp check_pending(_claim), do: Repo.rollback(:already_answered)

  # One live request per device. A newer request from the same account replaces
  # its own; another account has to wait for the first to be answered or expire.
  defp clear_pending(target_id, user_id) do
    now = Time.now()

    case Repo.one(
           from c in DeviceClaim,
             where: c.target_device_id == ^target_id and c.status == "pending"
         ) do
      nil ->
        :ok

      claim ->
        live? = NaiveDateTime.compare(claim.expires_at, now) == :gt
        if live? and claim.user_id != user_id, do: Repo.rollback(:already_pending)

        claim
        |> Ecto.Changeset.change(status: if(live?, do: "cancelled", else: "expired"))
        |> Repo.update!()
    end
  end

  defp check_rate(user_id) do
    cutoff = NaiveDateTime.add(Time.now(), -60)

    count =
      Repo.aggregate(
        from(c in DeviceClaim, where: c.user_id == ^user_id and c.inserted_at > ^cutoff),
        :count
      )

    if count >= @claims_per_minute, do: Repo.rollback(:rate_limited)
  end

  defp preload_claim(claim),
    do: Repo.preload(claim, [:user, :target_device, :requested_by_device], force: true)

  defp publish({:ok, claim} = result) do
    payload = %{claim: claim_json(claim)}

    for id <-
          Enum.uniq(
            Enum.reject([claim.target_device_id, claim.requested_by_device_id], &is_nil/1)
          ) do
      RoomEvents.notify_device(id, "device_claim_updated", payload)
    end

    result
  end

  defp publish(error), do: error

  # Ownership changes who can see whom, so every device on the account and the
  # changed device itself refresh their peer lists.
  defp announce({:ok, %Device{} = device} = result, user) do
    RoomEvents.notify_device(device.id, "self_updated", %{device: Accounts.peer_json(device)})
    RoomEvents.broadcast(device, "peer_updated", Accounts.peer_json(device))

    for id <- owned_ids(user), id != device.id do
      RoomEvents.notify_device(id, "peers_changed", %{})
    end

    result
  end

  defp announce(error, _user), do: error

  defp owned_ids(user),
    do: Repo.all(from d in Device, where: d.user_id == ^user.id, select: d.id)
end
