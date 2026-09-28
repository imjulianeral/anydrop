defmodule PhemeraWeb.HealthController do
  use PhemeraWeb, :controller

  def show(conn, _params), do: json(conn, %{ok: true})
end
