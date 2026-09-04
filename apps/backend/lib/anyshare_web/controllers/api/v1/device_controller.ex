defmodule AnyshareWeb.Api.V1.DeviceController do
  use AnyshareWeb, :controller

  alias Anyshare.Accounts
  alias Anyshare.RoomEvents
  alias Anyshare.Rooms

  def update(conn, params) do
    current_device = conn.assigns.current_device
    ip_hash = conn |> Rooms.connecting_ip() |> Rooms.ip_hash()

    case Accounts.update_device(current_device, params, ip_hash) do
      {:ok, device} ->
        RoomEvents.broadcast(device, "peer_updated", Accounts.peer_json(device))

        json(conn, %{
          device: Accounts.peer_json(device),
          peers: Enum.map(Accounts.list_peers(device), &Accounts.peer_json/1)
        })

      {:error, changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)
    end
  end
end
