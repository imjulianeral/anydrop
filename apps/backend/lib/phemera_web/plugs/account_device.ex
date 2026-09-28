defmodule PhemeraWeb.Plugs.AccountDevice do
  @moduledoc """
  Reads the device bearer token from `X-Device-Token` on account routes, so a
  request proves both who is signed in and which device is asking. With
  `required: true` a missing or unknown device is rejected.
  """
  @behaviour Plug

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Phemera.Accounts

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, options) do
    device = conn |> get_req_header("x-device-token") |> List.first() |> Accounts.authenticate()

    cond do
      device ->
        assign(conn, :current_device, device)

      options[:required] ->
        conn
        |> put_status(:unauthorized)
        |> json(%{
          error: "This device isn't connected yet. Reload the page and try again.",
          code: "device_required"
        })
        |> halt()

      true ->
        assign(conn, :current_device, nil)
    end
  end
end
