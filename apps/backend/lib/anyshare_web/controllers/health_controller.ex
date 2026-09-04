defmodule AnyshareWeb.HealthController do
  use AnyshareWeb, :controller

  def show(conn, _params), do: json(conn, %{ok: true})
end
