defmodule AnyshareWeb.Api.V1.UploadController do
  use AnyshareWeb, :controller

  alias Anyshare.Uploads

  def create(conn, %{"id" => id}) do
    case Uploads.start(conn.assigns.current_device, id) do
      {:ok, upload} -> json(conn, upload)
      {:error, reason} -> error(conn, reason)
    end
  end

  def part(conn, %{"id" => id} = params) do
    case Uploads.part(conn.assigns.current_device, id, Map.get(params, "part_number")) do
      {:ok, target} -> json(conn, target)
      {:error, reason} -> error(conn, reason)
    end
  end

  def delete(conn, %{"id" => id}) do
    case Uploads.abort(conn.assigns.current_device, id) do
      {:ok, _transfer} -> send_resp(conn, :no_content, "")
      {:error, reason} -> error(conn, reason)
    end
  end

  def error(conn, :not_found), do: ControllerHelpers.error(conn, :not_found, "not found")

  def error(conn, :already_completed),
    do: ControllerHelpers.error(conn, :conflict, "upload is no longer pending")

  def error(conn, :expired), do: ControllerHelpers.error(conn, :gone, "upload expired")

  def error(conn, :not_multipart),
    do: ControllerHelpers.error(conn, :conflict, "multipart upload has not started")

  def error(conn, :invalid_parts),
    do: ControllerHelpers.error(conn, :unprocessable_entity, "invalid upload parts")

  def error(conn, %Ecto.Changeset{} = changeset),
    do: ControllerHelpers.changeset_error(conn, changeset)

  def error(conn, _reason),
    do:
      ControllerHelpers.error(
        conn,
        :service_unavailable,
        "file storage unavailable; retry the upload"
      )
end
