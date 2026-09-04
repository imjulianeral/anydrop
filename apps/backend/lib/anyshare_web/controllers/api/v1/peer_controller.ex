defmodule AnyshareWeb.Api.V1.PeerController do
  use AnyshareWeb, :controller

  alias Anyshare.Accounts

  def index(conn, _params) do
    current_device = conn.assigns.current_device
    Accounts.touch_seen_if_stale(current_device.id)
    json(conn, %{peers: Enum.map(Accounts.list_peers(current_device), &Accounts.peer_json/1)})
  end
end
