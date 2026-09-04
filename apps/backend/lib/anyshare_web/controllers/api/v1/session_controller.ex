defmodule AnyshareWeb.Api.V1.SessionController do
  use AnyshareWeb, :controller

  alias Anyshare.Accounts
  alias Anyshare.RoomEvents
  alias Anyshare.Rooms

  def create(conn, params) do
    ip_hash = conn |> Rooms.connecting_ip() |> Rooms.ip_hash()

    case Accounts.create_session(params, ip_hash) do
      {:ok, token, device} ->
        RoomEvents.broadcast(device, "peer_updated", Accounts.peer_json(device))

        conn
        |> put_status(:created)
        |> json(%{
          token: token,
          device: Accounts.peer_json(device),
          peers: Enum.map(Accounts.list_peers(device), &Accounts.peer_json/1)
        })

      {:error, :invalid_id} ->
        ControllerHelpers.error(conn, :unprocessable_entity, "invalid id")

      {:error, changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)
    end
  end
end
