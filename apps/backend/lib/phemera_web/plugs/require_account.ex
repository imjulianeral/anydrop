defmodule PhemeraWeb.Plugs.RequireAccount do
  @moduledoc "Assigns `current_user` from the account cookie, or answers 401."
  @behaviour Plug

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Phemera.Auth

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, _options) do
    case Auth.session(get_session(conn, :account_token)) do
      {user, _authenticated_at} ->
        assign(conn, :current_user, user)

      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "Sign in first.", code: "unauthenticated"})
        |> halt()
    end
  end
end
