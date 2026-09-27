defmodule AnyshareWeb.Plugs.AuthSession do
  import Plug.Conn
  alias Anyshare.Auth

  def init(options), do: options

  def call(conn, _options) do
    options =
      Plug.Session.init(
        store: :cookie,
        key: "_anyshare_account",
        signing_salt: "account-signing",
        encryption_salt: "account-encryption",
        http_only: true,
        secure: String.starts_with?(Auth.origin(), "https://"),
        same_site: "Lax",
        max_age: 7 * 24 * 60 * 60
      )

    conn =
      conn
      |> Plug.Session.call(options)
      |> fetch_session()
      |> put_resp_header("cache-control", "no-store")

    if conn.method in ["GET", "HEAD"] or get_req_header(conn, "origin") == [Auth.origin()] do
      conn
    else
      conn |> send_resp(403, "Untrusted origin") |> halt()
    end
  end
end
