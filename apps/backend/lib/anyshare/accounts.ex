defmodule Anyshare.Accounts do
  @moduledoc false

  import Ecto.Query

  alias Anyshare.Accounts.Device
  alias Anyshare.DeviceName
  alias Anyshare.Repo
  alias Anyshare.Rooms
  alias Anyshare.Time

  @online_window_seconds 120
  @heartbeat_window_seconds 60
  @uuid ~r/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

  @spec create_session(map(), String.t()) :: {:ok, String.t(), Device.t()} | {:error, term()}
  def create_session(params, ip_hash) do
    id = Map.get(params, "id")

    if is_binary(id) and Regex.match?(@uuid, id) do
      device = Repo.get(Device, id) || %Device{id: id}
      token = issue_token()
      now = Time.now()

      attrs = %{
        display_name:
          present(Map.get(params, "display_name")) || present(device.display_name) ||
            DeviceName.generate(),
        device_kind:
          present(Map.get(params, "device_kind")) || present(device.device_kind) || "desktop",
        ip_hash: ip_hash,
        token_digest: digest(token),
        last_seen_at: now,
        created_at: device.created_at || now
      }

      case device |> Device.changeset(attrs) |> Repo.insert_or_update() do
        {:ok, saved_device} -> {:ok, token, saved_device}
        {:error, changeset} -> {:error, changeset}
      end
    else
      {:error, :invalid_id}
    end
  end

  @spec update_device(Device.t(), map(), String.t()) ::
          {:ok, Device.t()} | {:error, Ecto.Changeset.t()}
  def update_device(device, params, ip_hash) do
    attrs =
      %{ip_hash: ip_hash, last_seen_at: Time.now()}
      |> maybe_put(params, "display_name", :display_name, &Function.identity/1)
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
  def list_peers(device), do: device |> peers_query() |> Repo.all()

  @spec visible_peer(Device.t(), String.t()) :: Device.t() | nil
  def visible_peer(device, id) when is_binary(id) do
    device
    |> peers_query()
    |> where([peer], peer.id == ^id)
    |> Repo.one()
  end

  def visible_peer(_device, _id), do: nil

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
      display_name: device.display_name,
      device_kind: device.device_kind,
      room_code: device.room_code,
      last_seen_at: Time.iso8601(device.last_seen_at)
    }
  end

  defp peers_query(device) do
    cutoff = NaiveDateTime.add(Time.now(), -@online_window_seconds)

    base =
      from(peer in Device,
        where: peer.last_seen_at >= ^cutoff and peer.id != ^device.id
      )

    case present(device.room_code) do
      nil ->
        where(base, [peer], peer.ip_hash == ^device.ip_hash)

      room_code ->
        where(base, [peer], peer.ip_hash == ^device.ip_hash or peer.room_code == ^room_code)
    end
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
