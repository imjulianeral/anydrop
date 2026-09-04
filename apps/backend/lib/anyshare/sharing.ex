defmodule Anyshare.Sharing do
  @moduledoc false

  import Ecto.Query

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.ObjectStore
  alias Anyshare.Repo
  alias Anyshare.RoomEvents
  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Sharing.Transfer
  alias Anyshare.Time

  @transfer_ttl_seconds 24 * 60 * 60
  @short_link_ttl_seconds 7 * 24 * 60 * 60
  @short_code_attempts 8

  @spec list_transfers(Device.t(), String.t()) :: [Transfer.t()]
  def list_transfers(device, peer_id) do
    now = Time.now()

    from(transfer in Transfer,
      where: transfer.status not in ["expired", "failed"],
      where: transfer.expires_at >= ^now,
      where:
        (transfer.sender_id == ^device.id and transfer.recipient_id == ^peer_id) or
          (transfer.sender_id == ^peer_id and transfer.recipient_id == ^device.id),
      order_by: [asc: transfer.created_at]
    )
    |> Repo.all()
  end

  @spec create_transfer(Device.t(), map()) ::
          {:ok, Transfer.t(), Device.t() | nil}
          | {:error, :recipient_not_found | Ecto.Changeset.t()}
  def create_transfer(sender, params) do
    recipient_id = present(Map.get(params, "recipient_id"))
    recipient = if recipient_id, do: Accounts.visible_peer(sender, recipient_id), else: nil

    if recipient_id && is_nil(recipient) do
      {:error, :recipient_not_found}
    else
      kind = present(Map.get(params, "kind")) || "file"
      now = Time.now()

      attrs = %{
        id: Ecto.UUID.generate(),
        sender_id: sender.id,
        recipient_id: recipient_id,
        kind: kind,
        filename: Map.get(params, "filename"),
        byte_size: Map.get(params, "byte_size"),
        content_type: Map.get(params, "content_type"),
        body: Map.get(params, "body"),
        status: if(kind == "text", do: "delivered", else: "pending"),
        expires_at: NaiveDateTime.add(now, @transfer_ttl_seconds),
        created_at: now
      }

      attrs =
        if kind == "file" do
          Map.put(attrs, :r2_key, transfer_key(now, Map.get(params, "filename")))
        else
          attrs
        end

      case %Transfer{} |> Transfer.changeset(attrs) |> Repo.insert() do
        {:ok, transfer} -> {:ok, transfer, recipient}
        {:error, changeset} -> {:error, changeset}
      end
    end
  end

  @spec get_visible_transfer(Device.t(), String.t()) :: Transfer.t() | nil
  def get_visible_transfer(device, id) do
    from(transfer in Transfer,
      where: transfer.id == ^id,
      where: transfer.sender_id == ^device.id or transfer.recipient_id == ^device.id
    )
    |> Repo.one()
  end

  @spec complete_transfer(Device.t(), String.t()) ::
          {:ok, Transfer.t()} | {:error, :not_found | :already_completed | Ecto.Changeset.t()}
  def complete_transfer(sender, id) do
    case Repo.get_by(Transfer, id: id, sender_id: sender.id) do
      nil ->
        {:error, :not_found}

      %Transfer{status: "pending"} = transfer ->
        transfer
        |> Transfer.changeset(%{status: "uploaded"})
        |> Repo.update()

      _transfer ->
        {:error, :already_completed}
    end
  end

  @spec create_short_link(Device.t(), String.t()) ::
          {:ok, ShortLink.t()} | {:error, Ecto.Changeset.t() | :code_allocation_failed}
  def create_short_link(device, target_url) do
    attrs = %{
      device_id: device.id,
      target_url: String.trim(target_url),
      expires_at: NaiveDateTime.add(Time.now(), @short_link_ttl_seconds),
      created_at: Time.now()
    }

    insert_short_link(attrs, @short_code_attempts)
  end

  @spec mint_short_link(Device.t(), Transfer.t()) ::
          {:ok, ShortLink.t()} | {:error, Ecto.Changeset.t() | :code_allocation_failed}
  def mint_short_link(device, transfer) do
    case Repo.one(from(link in ShortLink, where: link.transfer_id == ^transfer.id, limit: 1)) do
      nil ->
        insert_short_link(
          %{
            device_id: device.id,
            transfer_id: transfer.id,
            expires_at: transfer.expires_at,
            created_at: Time.now()
          },
          @short_code_attempts
        )

      link ->
        {:ok, link}
    end
  end

  @spec list_short_links(Device.t()) :: [ShortLink.t()]
  def list_short_links(device) do
    now = Time.now()

    from(link in ShortLink,
      where: link.device_id == ^device.id and link.expires_at >= ^now,
      order_by: [desc: link.created_at],
      preload: [:transfer]
    )
    |> Repo.all()
  end

  @spec get_live_short_link(String.t()) :: ShortLink.t() | nil
  def get_live_short_link(code) do
    now = Time.now()

    from(link in ShortLink,
      where: link.code == ^String.upcase(code) and link.expires_at >= ^now,
      preload: [:transfer]
    )
    |> Repo.one()
  end

  @spec expire_stale() :: :ok
  def expire_stale do
    now = Time.now()

    from(transfer in Transfer,
      where: transfer.status in ["pending", "uploaded", "delivered"],
      where: transfer.expires_at < ^now
    )
    |> Repo.all()
    |> Enum.each(fn transfer ->
      if present(transfer.r2_key), do: ObjectStore.delete(transfer.r2_key)

      transfer
      |> Transfer.changeset(%{status: "expired"})
      |> Repo.update!()
    end)

    from(link in ShortLink, where: link.expires_at <= ^now) |> Repo.delete_all()
    :ok
  end

  @spec transfer_json(Transfer.t(), Device.t(), keyword()) :: map()
  def transfer_json(transfer, viewer, options \\ []) do
    payload = %{
      id: transfer.id,
      sender_id: transfer.sender_id,
      recipient_id: transfer.recipient_id,
      kind: transfer.kind,
      filename: transfer.filename,
      byte_size: transfer.byte_size,
      content_type: transfer.content_type,
      status: transfer.status,
      expires_at: Time.iso8601(transfer.expires_at),
      created_at: Time.iso8601(transfer.created_at)
    }

    payload =
      if transfer.kind == "text" and viewer.id in [transfer.sender_id, transfer.recipient_id] do
        Map.put(payload, :body, transfer.body)
      else
        payload
      end

    if Keyword.get(options, :download, false) and downloadable?(transfer) do
      Map.put(payload, :download, %{url: ObjectStore.presign_get(transfer.r2_key)})
    else
      payload
    end
  end

  @spec short_link_json(ShortLink.t()) :: map()
  def short_link_json(%ShortLink{transfer: %Transfer{} = transfer} = link) do
    payload =
      %{
        code: link.code,
        expires_at: Time.iso8601(link.expires_at)
      }
      |> Map.merge(drop_json(transfer))

    if downloadable?(transfer) do
      Map.put(payload, :download, %{url: ObjectStore.presign_get(transfer.r2_key)})
    else
      payload
    end
  end

  def short_link_json(link) do
    %{
      code: link.code,
      expires_at: Time.iso8601(link.expires_at),
      kind: "url",
      url: link.target_url
    }
  end

  @spec offer_transfer(Transfer.t(), Device.t() | nil) :: :ok
  def offer_transfer(_transfer, nil), do: :ok

  def offer_transfer(transfer, recipient) do
    RoomEvents.broadcast(
      recipient,
      "transfer_offered",
      transfer_json(transfer, recipient, download: true)
    )
  end

  @spec deliver_text(Transfer.t(), Device.t() | nil) :: :ok
  def deliver_text(_transfer, nil), do: :ok

  def deliver_text(transfer, recipient) do
    RoomEvents.broadcast(recipient, "text_received", transfer_json(transfer, recipient))
  end

  defp insert_short_link(_attrs, 0), do: {:error, :code_allocation_failed}

  defp insert_short_link(attrs, attempts_left) do
    code = issue_short_code()

    case %ShortLink{} |> ShortLink.changeset(Map.put(attrs, :code, code)) |> Repo.insert() do
      {:ok, link} ->
        {:ok, Repo.preload(link, :transfer)}

      {:error, changeset} when attempts_left > 1 ->
        if Keyword.has_key?(changeset.errors, :code) do
          insert_short_link(attrs, attempts_left - 1)
        else
          {:error, changeset}
        end

      {:error, changeset} ->
        {:error, changeset}
    end
  end

  defp issue_short_code do
    7
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
    |> String.replace(~r/[^A-Za-z0-9]/u, "")
    |> String.pad_trailing(7, "0")
    |> binary_part(0, 7)
    |> String.upcase()
  end

  defp transfer_key(now, filename) do
    date = Calendar.strftime(now, "%Y-%m-%d")
    "transfers/#{date}/#{Ecto.UUID.generate()}/#{sanitize_filename(filename)}"
  end

  defp sanitize_filename(filename) do
    sanitized =
      filename
      |> to_string()
      |> Path.basename()
      |> String.replace(~r/[^A-Za-z0-9._-]/u, "_")

    if sanitized == "", do: "file", else: sanitized
  end

  defp drop_json(transfer) do
    payload = %{
      id: transfer.id,
      kind: transfer.kind,
      filename: transfer.filename,
      byte_size: transfer.byte_size,
      content_type: transfer.content_type,
      status: transfer.status,
      expires_at: Time.iso8601(transfer.expires_at)
    }

    if transfer.kind == "text", do: Map.put(payload, :body, transfer.body), else: payload
  end

  defp downloadable?(transfer) do
    transfer.kind == "file" and transfer.status in ["uploaded", "delivered"] and
      present(transfer.r2_key)
  end

  defp present(value) when value in [nil, ""], do: nil
  defp present(value), do: value
end
