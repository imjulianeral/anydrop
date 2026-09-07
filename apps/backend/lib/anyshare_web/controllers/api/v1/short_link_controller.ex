defmodule AnyshareWeb.Api.V1.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing

  def index(conn, _params) do
    device = conn.assigns.current_device

    links =
      device
      |> Sharing.list_short_links()
      |> Enum.map(&Sharing.short_link_json/1)

    json(conn, %{short_links: links, stats: Sharing.daily_stats(device)})
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

  def stats(conn, %{"id" => code}) do
    device = conn.assigns.current_device

    case Sharing.get_live_short_link(code) do
      %{device_id: device_id} = link when device_id == device.id ->
        json(conn, %{
          stats: Sharing.daily_stats(device, 7, link.code),
          view_count: link.view_count || 0,
          download_count: link.download_count || 0
        })

      _missing ->
        ControllerHelpers.error(conn, :not_found, "not found")
    end
  end

  def show(conn, %{"id" => code}) do
    case Sharing.get_live_short_link(code) do
      nil ->
        ControllerHelpers.error(conn, :not_found, "not found")

      link ->
        Sharing.record_event(link, "view")
        json(conn, %{short_link: Sharing.short_link_json(link)})
    end
  end

  def download(conn, %{"id" => code}) do
    case Sharing.get_live_short_link(code) do
      %{transfer: %{kind: "file", status: status, r2_key: key, filename: filename}} = link
      when status in ["uploaded", "delivered"] and is_binary(key) and key != "" ->
        Sharing.record_event(link, "download")
        redirect_to_object(conn, Anyshare.ObjectStore.presign_get(key, filename: filename))

      _missing ->
        ControllerHelpers.error(conn, :not_found, "not found")
    end
  end

  defp redirect_to_object(conn, url) do
    if String.starts_with?(url, ["http://", "https://"]) do
      redirect(conn, external: url)
    else
      redirect(conn, to: url)
    end
  end
end
