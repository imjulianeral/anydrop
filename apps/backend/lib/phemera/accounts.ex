defmodule Phemera.Accounts do
  @moduledoc false

  import Ecto.Query

  alias Phemera.Accounts.Device
  alias Phemera.DeviceName
  alias Phemera.Repo
  alias Phemera.Rooms
  alias Phemera.Time

  @online_window_seconds 120
  @heartbeat_window_seconds 60
  @uuid ~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

  @spec create_session(map(), String.t(), String.t() | nil) ::
          {:ok, String.t(), Device.t()} | {:error, term()}
  def create_session(params, ip_hash, credential \\ nil) do
    id = Map.get(params, "id")

    if is_binary(id) and Regex.match?(@uuid, id) do
      device = Repo.get(Device, id) || %Device{id: id}

      with {:ok, token} <- session_token(device, credential) do
        save_session(device, params, ip_hash, token)
      end
    else
      {:error, :invalid_id}
    end
  end

  @spec update_device(Device.t(), map(), String.t()) ::
          {:ok, Device.t()} | {:error, Ecto.Changeset.t()}
  def update_device(device, params, ip_hash) do
    # A saved device keeps the name its owner chose; renames go through the account.
    params = if device.user_id, do: Map.delete(params, "display_name"), else: params

    attrs =
      %{ip_hash: ip_hash, last_seen_at: Time.now()}
      |> maybe_put(params, "display_name", :display_name, &Function.identity/1)
      |> maybe_put(params, "public_key", :public_key, &Function.identity/1)
      |> maybe_put(params, "room_code", :room_code, &Rooms.normalize_code/1)

    device
    |> Device.changeset(attrs)
    |> Repo.update()
  end

  @spec authenticate(term()) :: Device.t() | nil
  def authenticate(token) when is_binary(token) and token != "" do
    Repo.get_by(Device, token_digest: digest(token))
  end

  def authenticate(_token), do: nil

  @spec issue_token() :: String.t()
  def issue_token, do: :crypto.strong_rand_bytes(32) |> Base.encode16(case: :lower)

  @spec digest(String.t()) :: String.t()
  def digest(token), do: :crypto.hash(:sha256, token) |> Base.encode16(case: :lower)

  @spec list_peers(Device.t()) :: [Device.t()]
  def list_peers(device), do: device |> peers_query(reachable_user_ids(device)) |> Repo.all()

  @doc """
  Peers as JSON, each tagged with how the viewer can reach it: its own saved
  devices (`mine`), a teammate's saved devices (`team`), or the local network.
  """
  @spec peers_json(Device.t()) :: [map()]
  def peers_json(device) do
    user_ids = reachable_user_ids(device)

    device
    |> peers_query(user_ids)
    |> Repo.all()
    |> Enum.map(&peer_json(&1, relation(device, &1, user_ids)))
  end

  @spec visible_peer(Device.t(), String.t()) :: Device.t() | nil
  def visible_peer(device, id) when is_binary(id) do
    device
    |> peers_query(reachable_user_ids(device))
    |> where([peer], peer.id == ^id)
    |> Repo.one()
  end

  def visible_peer(_device, _id), do: nil

  @doc "An online device on the same network, regardless of who owns it."
  @spec nearby_peer(Device.t(), String.t()) :: Device.t() | nil
  def nearby_peer(device, id) when is_binary(id) do
    device
    |> peers_query([])
    |> where([peer], peer.id == ^id)
    |> Repo.one()
  end

  def nearby_peer(_device, _id), do: nil

  @doc "Users whose saved devices this device can reach from anywhere."
  @spec reachable_user_ids(Device.t()) :: [Ecto.UUID.t()]
  def reachable_user_ids(%Device{user_id: nil}), do: []

  def reachable_user_ids(%Device{user_id: user_id}),
    do: Enum.uniq([user_id | Phemera.Teams.teammate_ids(user_id)])

  @doc """
  Other devices that can see this one from anywhere: the owner's saved devices
  and teammates' saved devices. Reads the owner fresh, since a long-lived socket
  may hold a device struct from before it was saved.
  """
  @spec reachable_device_ids(String.t()) :: [String.t()]
  def reachable_device_ids(device_id) do
    case Repo.get(Device, device_id) do
      nil ->
        []

      device ->
        case reachable_user_ids(device) do
          [] ->
            []

          user_ids ->
            Repo.all(
              from peer in Device,
                where: peer.user_id in ^user_ids and peer.id != ^device_id,
                select: peer.id
            )
        end
    end
  end

  @spec online?(Device.t()) :: boolean()
  def online?(%Device{last_seen_at: nil}), do: false

  def online?(device),
    do:
      NaiveDateTime.compare(
        device.last_seen_at,
        NaiveDateTime.add(Time.now(), -@online_window_seconds)
      ) != :lt

  @spec touch_seen(Device.t()) :: :ok
  def touch_seen(device) do
    from(row in Device, where: row.id == ^device.id)
    |> Repo.update_all(set: [last_seen_at: Time.now()])

    :ok
  end

  @spec touch_seen_if_stale(String.t()) :: :ok
  def touch_seen_if_stale(device_id) do
    cutoff = NaiveDateTime.add(Time.now(), -@heartbeat_window_seconds)

    from(device in Device,
      where: device.id == ^device_id and device.last_seen_at < ^cutoff
    )
    |> Repo.update_all(set: [last_seen_at: Time.now()])

    :ok
  end

  @spec peer_json(Device.t()) :: map()
  def peer_json(device) do
    %{
      id: device.id,
      public_key: device.public_key,
      display_name: device.display_name,
      device_kind: device.device_kind,
      room_code: device.room_code,
      saved: not is_nil(device.user_id),
      last_seen_at: Time.iso8601(device.last_seen_at)
    }
  end

  @spec peer_json(Device.t(), String.t()) :: map()
  def peer_json(device, relation), do: device |> peer_json() |> Map.put(:relation, relation)

  defp relation(%Device{user_id: user_id}, %Device{user_id: user_id}, _user_ids)
       when not is_nil(user_id),
       do: "mine"

  defp relation(_device, %Device{user_id: user_id}, user_ids) when not is_nil(user_id),
    do: if(user_id in user_ids, do: "team", else: "nearby")

  defp relation(_device, _peer, _user_ids), do: "nearby"

  defp save_session(device, params, ip_hash, token) do
    now = Time.now()

    # The owner's saved name wins over whatever this browser remembers.
    requested_name = if device.user_id, do: nil, else: present(Map.get(params, "display_name"))

    attrs = %{
      display_name: requested_name || present(device.display_name) || DeviceName.generate(),
      device_kind:
        present(Map.get(params, "device_kind")) || present(device.device_kind) || "desktop",
      ip_hash: ip_hash,
      token_digest: digest(token),
      last_seen_at: now,
      created_at: device.created_at || now
    }

    attrs = maybe_put(attrs, params, "public_key", :public_key, &Function.identity/1)

    case device |> Device.changeset(attrs) |> Repo.insert_or_update() do
      {:ok, saved_device} -> {:ok, token, saved_device}
      {:error, changeset} -> {:error, changeset}
    end
  end

  defp session_token(%Device{token_digest: nil}, nil), do: {:ok, issue_token()}

  defp session_token(device, credential) when is_binary(credential) do
    if Regex.match?(~r/^[0-9a-f]{64}$/u, credential) and
         (is_nil(device.token_digest) or
            Plug.Crypto.secure_compare(device.token_digest, digest(credential))),
       do: {:ok, credential},
       else: {:error, :unauthorized}
  end

  defp session_token(_device, _credential), do: {:error, :unauthorized}

  defp peers_query(device, user_ids) do
    cutoff = NaiveDateTime.add(Time.now(), -@online_window_seconds)

    from(peer in Device,
      where: peer.last_seen_at >= ^cutoff and peer.id != ^device.id,
      where: peer.ip_hash == ^device.ip_hash or peer.user_id in ^user_ids
    )
  end

  defp maybe_put(attrs, params, source_key, destination_key, transform) do
    if Map.has_key?(params, source_key) do
      Map.put(attrs, destination_key, transform.(Map.get(params, source_key)))
    else
      attrs
    end
  end

  defp present(value) when value in [nil, ""], do: nil

  defp present(value) when is_binary(value),
    do: if(String.trim(value) == "", do: nil, else: value)

  defp present(value), do: value
end
