defmodule AnyshareWeb.ControllerHelpers do
  @moduledoc false

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Anyshare.Errors

  @spec changeset_error(Plug.Conn.t(), Ecto.Changeset.t()) :: Plug.Conn.t()
  def changeset_error(conn, changeset) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: Errors.message(changeset)})
  end

  @spec error(Plug.Conn.t(), Plug.Conn.status(), String.t()) :: Plug.Conn.t()
  def error(conn, status, message) do
    conn |> put_status(status) |> json(%{error: message})
  end
end
