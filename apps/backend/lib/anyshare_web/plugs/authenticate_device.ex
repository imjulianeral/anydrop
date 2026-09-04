defmodule AnyshareWeb.Plugs.AuthenticateDevice do
  @moduledoc false

  @behaviour Plug

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Anyshare.Accounts

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, _options) do
    case conn |> bearer_token() |> Accounts.authenticate() do
      nil -> conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"}) |> halt()
      device -> assign(conn, :current_device, device)
    end
  end

  @spec bearer_token(Plug.Conn.t()) :: String.t() | nil
  def bearer_token(conn) do
    conn
    |> get_req_header("authorization")
    |> List.first()
    |> case do
      nil ->
        nil

      authorization ->
        case Regex.run(~r/^(?:Bearer|Token)\s+(?:token=\")?([^\"]+)\"?$/iu, authorization) do
          [_full, token] -> String.trim(token)
          _no_match -> nil
        end
    end
  end
end
