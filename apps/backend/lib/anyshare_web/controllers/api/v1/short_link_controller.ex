defmodule AnyshareWeb.Api.V1.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing

  def index(conn, _params) do
    links =
      conn.assigns.current_device
      |> Sharing.list_short_links()
      |> Enum.map(&Sharing.short_link_json/1)

    json(conn, %{short_links: links})
  end

  def create(conn, params) do
    target_url = params |> Map.get("url", "") |> to_string()

    case Sharing.create_short_link(conn.assigns.current_device, target_url) do
      {:ok, link} ->
        conn |> put_status(:created) |> json(%{short_link: Sharing.short_link_json(link)})

      {:error, %Ecto.Changeset{} = changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)

      {:error, :code_allocation_failed} ->
        ControllerHelpers.error(conn, :service_unavailable, "could not allocate short code")
    end
  end

  def show(conn, %{"id" => code}) do
    case Sharing.get_live_short_link(code) do
      nil -> ControllerHelpers.error(conn, :not_found, "not found")
      link -> json(conn, %{short_link: Sharing.short_link_json(link)})
    end
  end
end
