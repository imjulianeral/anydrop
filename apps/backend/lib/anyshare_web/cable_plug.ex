defmodule AnyshareWeb.CablePlug do
  @moduledoc false

  @behaviour Plug

  import Plug.Conn

  alias Anyshare.Accounts
  alias AnyshareWeb.Cors

  @protocol "actioncable-v1-json"

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, _options) do
    conn = fetch_query_params(conn)
    origin = conn |> get_req_header("origin") |> List.first()

    with true <- Cors.allowed_origin?(origin),
         true <- protocol_offered?(conn),
         device when not is_nil(device) <- Accounts.authenticate(conn.query_params["token"]) do
      :ok = Accounts.touch_seen(device)

      conn
      |> put_resp_header("sec-websocket-protocol", @protocol)
      |> WebSockAdapter.upgrade(AnyshareWeb.CableSocket, device, timeout: 60_000)
      |> halt()
    else
      false -> conn |> send_resp(403, "Forbidden") |> halt()
      nil -> conn |> send_resp(401, "Unauthorized") |> halt()
    end
  end

  defp protocol_offered?(conn) do
    conn
    |> get_req_header("sec-websocket-protocol")
    |> Enum.flat_map(&String.split(&1, ","))
    |> Enum.map(&String.trim/1)
    |> Enum.member?(@protocol)
  end
end
