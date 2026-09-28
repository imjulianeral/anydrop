defmodule PhemeraWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :phemera

  plug PhemeraWeb.SecurityHeaders
  plug PhemeraWeb.Cors

  plug Plug.Static,
    at: "/",
    from: :phemera,
    gzip: false,
    only: ~w(robots.txt)

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug PhemeraWeb.Router
end
