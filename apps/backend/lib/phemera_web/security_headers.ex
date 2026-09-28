defmodule PhemeraWeb.SecurityHeaders do
  @moduledoc false
  import Plug.Conn

  def init(options), do: options

  def call(conn, _options) do
    conn =
      conn
      |> put_resp_header("x-content-type-options", "nosniff")
      |> put_resp_header("referrer-policy", "no-referrer")
      |> put_resp_header("x-frame-options", "DENY")
      |> put_resp_header(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
      )

    if conn.scheme == :https do
      put_resp_header(conn, "strict-transport-security", "max-age=31536000; includeSubDomains")
    else
      conn
    end
  end
end
