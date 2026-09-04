defmodule AnyshareWeb.Cors do
  @moduledoc false

  @behaviour Plug

  import Plug.Conn

  @local_origins MapSet.new(["http://127.0.0.1:3000", "http://localhost:3000"])
  @website_origin ~r/^https:\/\/anyshare-website(?:-[\w-]+)?\.[\w.-]+\.workers\.dev$/u

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, _options) do
    origin = conn |> get_req_header("origin") |> List.first()
    conn = if allowed_origin?(origin), do: put_headers(conn, origin), else: conn

    if conn.method == "OPTIONS" do
      conn |> send_resp(204, "") |> halt()
    else
      conn
    end
  end

  @spec allowed_origin?(String.t() | nil) :: boolean()
  def allowed_origin?(nil), do: true

  def allowed_origin?(origin) do
    MapSet.member?(@local_origins, origin) or origin in configured_origins() or
      Regex.match?(@website_origin, origin)
  end

  defp put_headers(conn, nil), do: conn

  defp put_headers(conn, origin) do
    conn
    |> put_resp_header("access-control-allow-origin", origin)
    |> put_resp_header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD")
    |> put_resp_header("access-control-allow-headers", "Authorization,Content-Type")
    |> put_resp_header("access-control-expose-headers", "Authorization")
    |> put_resp_header("access-control-max-age", "86400")
    |> put_resp_header("vary", "Origin")
  end

  defp configured_origins do
    :anyshare
    |> Application.get_env(:allowed_origins, "")
    |> String.split(",", trim: true)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
  end
end
