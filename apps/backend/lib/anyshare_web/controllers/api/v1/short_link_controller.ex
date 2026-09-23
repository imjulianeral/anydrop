defmodule AnyshareWeb.Api.V1.ShortLinkController do
  use AnyshareWeb, :controller

  alias Anyshare.Sharing

  def index(conn, _params) do
    device = conn.assigns.current_device

    links =
      device
      |> Sharing.list_short_links()
      |> Enum.map(&Sharing.short_link_json/1)

    json(conn, %{short_links: links, events: Sharing.list_events(device)})
  end

  def create(conn, params) do
    target_url = params |> Map.get("url", "") |> to_string()

    case Sharing.create_short_link(conn.assigns.current_device, target_url, params) do
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
          events: Sharing.list_events(device, 7, link.code),
          view_count: link.view_count || 0,
          download_count: link.download_count || 0
        })

      _missing ->
        ControllerHelpers.error(conn, :not_found, "not found")
    end
  end

  def show(conn, %{"id" => code}) do
    case Sharing.get_live_short_link(code) do
      %Sharing.ShortLink{target_url: url, password_verifier: verifier} = link
      when is_binary(url) and is_binary(verifier) ->
        json(conn, %{short_link: Sharing.short_link_json(link, reveal: false)})

      nil ->
        ControllerHelpers.error(conn, :not_found, "not found")

      _link ->
        case Sharing.consume_short_link(code, "view") do
          {:error, :not_found} ->
            ControllerHelpers.error(conn, :not_found, "not found")

          {:ok, link} ->
            json(conn, %{short_link: Sharing.short_link_json(link)})
        end
    end
  end

  def unlock(conn, %{"id" => code} = params) do
    password = params |> Map.get("password", "") |> to_string()

    case Sharing.unlock_short_link(code, password) do
      {:ok, link} ->
        json(conn, %{short_link: Sharing.short_link_json(link)})

      {:error, :not_found} ->
        ControllerHelpers.error(conn, :not_found, "not found")

      {:error, :invalid_password} ->
        ControllerHelpers.error(conn, :unauthorized, "incorrect password")

      {:error, :not_protected} ->
        ControllerHelpers.error(conn, :unprocessable_entity, "this link has no password")
    end
  end

  def download(conn, %{"id" => code}) do
    case Sharing.consume_short_link(code, "download") do
      {:ok, %{transfer: %{r2_key: key, filename: filename}}} ->
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
