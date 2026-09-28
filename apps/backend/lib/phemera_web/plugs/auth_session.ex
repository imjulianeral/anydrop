defmodule PhemeraWeb.Plugs.AuthSession do
  import Plug.Conn
  alias Phemera.Auth

  @cookie "_phemera_account"
  # Name used before the AnyShare → Phemera rename. The signed value doesn't
  # depend on the cookie name, so an old session moves over unchanged.
  @legacy_cookie "_anyshare_account"

  def init(options), do: options

  def call(conn, _options) do
    options =
      Plug.Session.init(
        store: :cookie,
        key: @cookie,
        signing_salt: "account-signing",
        encryption_salt: "account-encryption",
        http_only: true,
        secure: String.starts_with?(Auth.origin(), "https://"),
        same_site: "Lax",
        max_age: 7 * 24 * 60 * 60
      )

    {conn, migrated?} = adopt_legacy_cookie(conn)

    conn =
      conn
      |> Plug.Session.call(options)
      |> fetch_session()
      |> put_resp_header("cache-control", "no-store")
      |> rewrite_legacy_cookie(migrated?)

    if conn.method in ["GET", "HEAD"] or get_req_header(conn, "origin") == [Auth.origin()] do
      conn
    else
      conn |> send_resp(403, "Untrusted origin") |> halt()
    end
  end

  defp adopt_legacy_cookie(conn) do
    conn = fetch_cookies(conn)

    case conn.req_cookies do
      %{@cookie => _} ->
        {conn, false}

      %{@legacy_cookie => value} ->
        conn = %{
          conn
          | req_cookies: Map.put(conn.req_cookies, @cookie, value),
            cookies: Map.put(conn.cookies, @cookie, value)
        }

        {conn, true}

      _ ->
        {conn, false}
    end
  end

  defp rewrite_legacy_cookie(conn, false), do: conn

  defp rewrite_legacy_cookie(conn, true) do
    conn
    |> configure_session(renew: true)
    |> delete_resp_cookie(@legacy_cookie)
  end
end
