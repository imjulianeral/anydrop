defmodule AnyshareWeb.Api.V1.TransferController do
  use AnyshareWeb, :controller

  alias Anyshare.ObjectStore
  alias Anyshare.Sharing

  def index(conn, params) do
    peer_id = params |> Map.get("peer_id", "") |> to_string() |> String.trim()

    if peer_id == "" do
      ControllerHelpers.error(conn, :unprocessable_entity, "peer_id required")
    else
      current_device = conn.assigns.current_device

      transfers =
        current_device
        |> Sharing.list_transfers(peer_id)
        |> Enum.map(&Sharing.transfer_json(&1, current_device, download: true))

      json(conn, %{transfers: transfers})
    end
  end

  def create(conn, params) do
    current_device = conn.assigns.current_device

    case Sharing.create_transfer(current_device, params) do
      {:ok, %{kind: "text"} = transfer, recipient} ->
        :ok = Sharing.deliver_text(transfer, recipient)

        respond_transfer(conn, :created, current_device, transfer)

      {:ok, transfer, _recipient} ->
        content_type = present(transfer.content_type) || "application/octet-stream"

        upload =
          if transfer.upload_part_size do
            %{
              type: "multipart",
              part_size: transfer.upload_part_size,
              part_count: Anyshare.ObjectStore.Multipart.part_count(transfer)
            }
          else
            ObjectStore.presign_put(transfer.r2_key,
              content_type: content_type,
              byte_size: transfer.byte_size
            )
            |> Map.put(:type, "single")
          end

        conn
        |> put_status(:created)
        |> json(%{transfer: Sharing.transfer_json(transfer, current_device), upload: upload})

      {:error, :recipient_not_found} ->
        ControllerHelpers.error(conn, :not_found, "recipient not found")

      {:error, %Ecto.Changeset{} = changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)
    end
  end

  def show(conn, %{"id" => id}) do
    current_device = conn.assigns.current_device

    case Sharing.get_visible_transfer(current_device, id) do
      nil ->
        ControllerHelpers.error(conn, :not_found, "not found")

      transfer ->
        payload = %{transfer: Sharing.transfer_json(transfer, current_device)}

        payload =
          if transfer.kind == "file" and transfer.status in ["uploaded", "delivered"] and
               present(transfer.r2_key) do
            Map.put(payload, :download, %{url: ObjectStore.presign_get(transfer.r2_key)})
          else
            payload
          end

        json(conn, payload)
    end
  end

  def complete(conn, %{"id" => id} = params) do
    current_device = conn.assigns.current_device

    case Sharing.complete_transfer(current_device, id, Map.get(params, "parts")) do
      {:ok, transfer} ->
        recipient =
          if transfer.recipient_id,
            do: Anyshare.Repo.get(Anyshare.Accounts.Device, transfer.recipient_id)

        :ok = Sharing.offer_transfer(transfer, recipient)
        respond_transfer(conn, :ok, current_device, transfer, download: true)

      {:error, :not_found} ->
        ControllerHelpers.error(conn, :not_found, "not found")

      {:error, :already_completed} ->
        ControllerHelpers.error(conn, :conflict, "already completed")

      {:error, %Ecto.Changeset{} = changeset} ->
        ControllerHelpers.changeset_error(conn, changeset)

      {:error, reason} ->
        AnyshareWeb.Api.V1.UploadController.error(conn, reason)
    end
  end

  defp respond_transfer(conn, status, device, transfer, json_opts \\ []) do
    body = %{transfer: Sharing.transfer_json(transfer, device, json_opts)}

    if present(transfer.recipient_id) do
      conn |> put_status(status) |> json(body)
    else
      case Sharing.mint_short_link(device, transfer) do
        {:ok, link} ->
          conn
          |> put_status(status)
          |> json(Map.put(body, :short_link, Sharing.short_link_json(link)))

        {:error, error} ->
          short_link_error(conn, error)
      end
    end
  end

  defp short_link_error(conn, %Ecto.Changeset{} = changeset),
    do: ControllerHelpers.changeset_error(conn, changeset)

  defp short_link_error(conn, :code_allocation_failed),
    do: ControllerHelpers.error(conn, :service_unavailable, "could not allocate short code")

  defp present(value) when value in [nil, ""], do: nil
  defp present(value), do: value
end
