defmodule PhemeraWeb.DashboardController do
  use PhemeraWeb, :controller

  alias Phemera.Auth
  alias Phemera.Dashboard
  alias PhemeraWeb.Plugs.AccountDevice

  # Guests prove only the device; signed-in people also send the account cookie.
  plug AccountDevice, required: true

  def show(conn, params) do
    user =
      case Auth.session(get_session(conn, :account_token)) do
        {user, _authenticated_at} -> user
        nil -> nil
      end

    json(conn, Dashboard.build(conn.assigns.current_device, user, params))
  end
end
