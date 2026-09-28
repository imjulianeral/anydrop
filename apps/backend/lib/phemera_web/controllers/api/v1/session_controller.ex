defmodule PhemeraWeb.Api.V1.SessionController do
  use PhemeraWeb, :controller

  alias Phemera.Accounts
  alias Phemera.RoomEvents
  alias Phemera.Rooms

  def create(conn, params) do
    ip_hash = conn |> Rooms.connecting_ip() |> Rooms.ip_hash()

    credential = PhemeraWeb.Plugs.AuthenticateDevice.bearer_token(conn)

    case Accounts.create_session(params, ip_hash, credential) do
      {:ok, token, device} ->
        RoomEvents.broadcast(device, "peer_updated", Accounts.peer_json(device))

        conn
        |> put_status(:created)
        |> json(%{
          token: token,
          device: Accounts.peer_json(device),
          peers: Accounts.peers_json(device)
        })

      {:error, :unauthorized} ->
        ControllerHelpers.error(
          conn,
          :unauthorized,
          "This browser cannot verify its saved device identity. Create a new identity to continue; previous items stay with the old identity."
        )

      {:error, :invalid_id} ->
        ControllerHelpers.error(conn, :unprocessable_entity, "invalid id")

      {:error, changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)
    end
  end
end
