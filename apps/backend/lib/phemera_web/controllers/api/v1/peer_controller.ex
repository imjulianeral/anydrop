defmodule PhemeraWeb.Api.V1.PeerController do
  use PhemeraWeb, :controller

  alias Phemera.Accounts

  def index(conn, _params) do
    current_device = conn.assigns.current_device
    Accounts.touch_seen_if_stale(current_device.id)
    json(conn, %{peers: Accounts.peers_json(current_device)})
  end
end
