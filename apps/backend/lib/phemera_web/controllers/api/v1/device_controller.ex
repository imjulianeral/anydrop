defmodule PhemeraWeb.Api.V1.DeviceController do
  use PhemeraWeb, :controller

  alias Phemera.Accounts
  alias Phemera.RoomEvents
  alias Phemera.Rooms

  def update(conn, params) do
    current_device = conn.assigns.current_device
    ip_hash = conn |> Rooms.connecting_ip() |> Rooms.ip_hash()

    case Accounts.update_device(current_device, params, ip_hash) do
      {:ok, device} ->
        RoomEvents.broadcast(device, "peer_updated", Accounts.peer_json(device))

        json(conn, %{
          device: Accounts.peer_json(device),
          peers: Accounts.peers_json(device)
        })

      {:error, changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)
    end
  end
end
