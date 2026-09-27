defmodule Anyshare.Sharing do
  @moduledoc false

  import Ecto.Query

  alias Anyshare.Accounts
  alias Anyshare.Accounts.Device
  alias Anyshare.Moderation
  alias Anyshare.ObjectStore
  alias Anyshare.ObjectStore.Multipart
  alias Anyshare.Repo
  alias Anyshare.RoomEvents
  alias Anyshare.Sharing.Expiration
  alias Anyshare.Sharing.LinkEvent
  alias Anyshare.Sharing.LinkPassword
  alias Anyshare.Sharing.ShortLink
  alias Anyshare.Sharing.Transfer
  alias Anyshare.Time

  @short_code_attempts 8
  @download_token_salt "short-link-download"
  @download_token_max_age 604_800
  @hidden_statuses ~w(expired failed blocked)

  @spec list_transfers(Device.t(), String.t()) :: [Transfer.t()]
  def list_transfers(device, peer_id) do
    now = Time.now()

    from(transfer in Transfer,
      where: is_nil(transfer.group_id),
      where: transfer.status not in @hidden_statuses,
      where: transfer.expires_at > ^now,
      where: is_nil(transfer.max_downloads) or transfer.download_count < transfer.max_downloads,
      where:
        (transfer.sender_id == ^device.id and transfer.recipient_id == ^peer_id) or
          (transfer.sender_id == ^peer_id and transfer.recipient_id == ^device.id),
      order_by: [asc: transfer.created_at]
    )
    |> Repo.all()
  end

  def list_group_transfers(device, group_id) do
    now = Time.now()

    Repo.all(
      from t in Transfer,
        where: t.group_id == ^group_id,
        where: t.sender_id == ^device.id or t.recipient_id == ^device.id,
        where: t.status not in @hidden_statuses and t.expires_at > ^now,
        where: is_nil(t.max_downloads) or t.download_count < t.max_downloads,
        order_by: [asc: t.created_at]
    )
  end

  @spec create_transfer(Device.t(), map()) ::
          {:ok, Transfer.t(), Device.t() | nil}
          | {:error, :recipient_not_found | Ecto.Changeset.t()}
  def create_transfer(sender, params) do
    recipient_id = present(Map.get(params, "recipient_id"))
    group_id = present(Map.get(params, "group_id"))

    if group_id do
      Anyshare.Groups.with_recipient(sender, group_id, recipient_id, fn recipient ->
        insert_transfer(sender, params, recipient)
      end)
    else
      recipient = if recipient_id, do: Accounts.visible_peer(sender, recipient_id), else: nil
      insert_transfer(sender, params, recipient)
    end
  end

  defp insert_transfer(sender, params, recipient) do
    recipient_id = present(Map.get(params, "recipient_id"))

    if recipient_id && is_nil(recipient) do
      {:error, :recipient_not_found}
    else
      kind = present(Map.get(params, "kind")) || "file"
      now = Time.now()

      attrs = %{
        id: Ecto.UUID.generate(),
        sender_id: sender.id,
        recipient_id: recipient_id,
        group_id: present(Map.get(params, "group_id")),
        kind: kind,
        filename: Map.get(params, "filename"),
        byte_size: Map.get(params, "byte_size"),
        content_type: Map.get(params, "content_type"),
        body: Map.get(params, "body"),
        secret: Map.get(params, "secret"),
        status: if(kind == "text", do: "delivered", else: "pending"),
        expires_in: Map.get(params, "expires_in", Expiration.default_seconds()),
        max_downloads: Map.get(params, "max_downloads"),
        expires_at: NaiveDateTime.add(now, Expiration.default_seconds()),
        created_at: now
      }

      attrs =
        if kind == "file" do
          attrs
          |> Map.put(:r2_key, transfer_key(now, Map.get(params, "filename")))
        else
          attrs
        end

      changeset = Transfer.changeset(%Transfer{}, attrs)

      changeset =
        if kind == "file" and changeset.valid? do
          Ecto.Changeset.put_change(
            changeset,
            :upload_part_size,
            Multipart.part_size(Ecto.Changeset.get_field(changeset, :byte_size))
          )
        else
          changeset
        end

      case Repo.insert(changeset) do
        {:ok, transfer} -> {:ok, transfer, recipient}
        {:error, changeset} -> {:error, changeset}
      end
    end
  end

  @spec get_visible_transfer(Device.t(), String.t()) :: Transfer.t() | nil
  def get_visible_transfer(device, id) do
    now = Time.now()

    from(transfer in Transfer,
      where: transfer.expires_at > ^now,
      where: transfer.status not in @hidden_statuses,
      where: is_nil(transfer.max_downloads) or transfer.download_count < transfer.max_downloads,
      where: transfer.id == ^id,
      where: transfer.sender_id == ^device.id or transfer.recipient_id == ^device.id
    )
    |> Repo.one()
  end

  def complete_transfer(sender, id, parts \\ nil, signals \\ nil),
    do: Anyshare.Uploads.complete(sender, id, parts, signals)

  def open_transfer(device, id) do
    Repo.transaction(fn ->
      transfer = Repo.one(from(t in Transfer, where: t.id == ^id, lock: "FOR UPDATE"))

      if is_nil(transfer) or device.id not in [transfer.sender_id, transfer.recipient_id] or
           not live_transfer?(transfer),
         do: Repo.rollback(:not_found)

      if transfer.kind == "text" and device.id == transfer.recipient_id do
        increment_transfer(transfer)
      else
        transfer
      end
    end)
    |> notify_transfer_usage()
  end

  def download_transfer(id, token, opts \\ []) do
    consume = Keyword.get(opts, :consume, false)

    with {:ok, {^id, viewer_id}} <-
           Phoenix.Token.verify(AnyshareWeb.Endpoint, "transfer-download", token,
             max_age: 604_800
           ) do
      result =
        Repo.transaction(fn ->
          transfer = Repo.one(from(t in Transfer, where: t.id == ^id, lock: "FOR UPDATE"))

          if is_nil(transfer) or viewer_id not in [transfer.sender_id, transfer.recipient_id] or
               not downloadable?(transfer),
             do: Repo.rollback(:not_found)

          if consume and viewer_id == transfer.recipient_id,
            do: increment_transfer(transfer),
            else: transfer
        end)

      if consume, do: notify_transfer_usage(result), else: result
    else
      _invalid -> {:error, :not_found}
    end
  end

  defp transfer_download_url(transfer, viewer) do
    token =
      Phoenix.Token.sign(AnyshareWeb.Endpoint, "transfer-download", {transfer.id, viewer.id})

    "/api/v1/transfers/#{transfer.id}/download?token=#{URI.encode_www_form(token)}"
  end

  defp increment_transfer(transfer) do
    transfer
    |> Ecto.Changeset.change(download_count: transfer.download_count + 1)
    |> Repo.update!()
  end

  defp notify_transfer_usage({:ok, %Transfer{} = transfer} = result) do
    payload = %{id: transfer.id, download_count: transfer.download_count}

    for device_id <- Enum.uniq([transfer.sender_id, transfer.recipient_id]),
        is_binary(device_id) do
      RoomEvents.notify_device(device_id, "transfer_usage", payload)
    end

    result
  end

  defp notify_transfer_usage(result), do: result

  def consume_short_link(code, kind) when kind in ["view", "download"] do
    Repo.transaction(fn ->
      link =
        Repo.one(from(l in ShortLink, where: l.code == ^String.upcase(code), lock: "FOR UPDATE"))

      if is_nil(link) or not Expiration.live?(link), do: Repo.rollback(:not_found)

      transfer =
        if link.transfer_id,
          do: Repo.one(from(t in Transfer, where: t.id == ^link.transfer_id, lock: "FOR UPDATE"))

      if link.transfer_id && (is_nil(transfer) or not live_transfer?(transfer)),
        do: Repo.rollback(:not_found)

      if kind == "download" and (is_nil(transfer) or not downloadable?(transfer)),
        do: Repo.rollback(:not_found)

      updated_transfer =
        if transfer && (kind == "download" or transfer.kind == "text"),
          do: increment_transfer(transfer),
          else: transfer

      :ok = record_event(link, kind)
      {%{link | transfer: transfer}, updated_transfer}
    end)
    |> case do
      {:ok, {link, transfer}} ->
        notify_transfer_usage({:ok, transfer})
        {:ok, link}

      error ->
        error
    end
  end

  @spec create_short_link(Device.t(), String.t(), map()) ::
          {:ok, ShortLink.t()} | {:error, Ecto.Changeset.t() | :code_allocation_failed}
  def create_short_link(device, target_url, params \\ %{}) do
    attrs =
      %{
        device_id: device.id,
        target_url: String.trim(target_url),
        expires_in: Map.get(params, "expires_in", Expiration.default_seconds()),
        max_downloads: Map.get(params, "max_downloads"),
        expires_at: NaiveDateTime.add(Time.now(), Expiration.default_seconds()),
        created_at: Time.now()
      }
      |> maybe_put_password(Map.get(params, "password"))

    case Moderation.screen_url(device, attrs.target_url) do
      :ok -> insert_short_link(attrs, @short_code_attempts)
      {:blocked, _threats} -> {:error, unsafe_url_changeset(attrs)}
    end
  end

  defp unsafe_url_changeset(attrs) do
    %ShortLink{}
    |> Ecto.Changeset.change(Map.take(attrs, [:device_id, :target_url]))
    |> Ecto.Changeset.add_error(:target_url, "is flagged as unsafe")
    |> Map.put(:action, :insert)
  end

  @spec unlock_short_link(String.t(), term()) ::
          {:ok, ShortLink.t()} | {:error, :not_found | :invalid_password | :not_protected}
  def unlock_short_link(code, password) do
    case get_live_short_link(code) do
      %ShortLink{password_verifier: verifier} = link when is_binary(verifier) ->
        if LinkPassword.verify(password, verifier) do
          consume_short_link(link.code, "view")
        else
          {:error, :invalid_password}
        end

      nil ->
        {:error, :not_found}

      _link ->
        {:error, :not_protected}
    end
  end

  @spec short_link_download_allowed?(ShortLink.t(), term()) :: boolean()
  def short_link_download_allowed?(%ShortLink{password_verifier: nil}, _token), do: true

  def short_link_download_allowed?(%ShortLink{code: code}, token) when is_binary(token) do
    case Phoenix.Token.verify(AnyshareWeb.Endpoint, @download_token_salt, token,
           max_age: @download_token_max_age
         ) do
      {:ok, ^code} -> true
      _invalid -> false
    end
  end

  def short_link_download_allowed?(_link, _token), do: false

  @spec mint_short_link(Device.t(), Transfer.t(), map()) ::
          {:ok, ShortLink.t()} | {:error, Ecto.Changeset.t() | :code_allocation_failed}
  def mint_short_link(device, transfer, params \\ %{}) do
    case Repo.one(from(link in ShortLink, where: link.transfer_id == ^transfer.id, limit: 1)) do
      nil ->
        insert_short_link(
          %{
            device_id: device.id,
            transfer_id: transfer.id,
            max_downloads: transfer.max_downloads,
            expires_at: transfer.expires_at,
            created_at: Time.now()
          }
          |> maybe_put_password(Map.get(params, "password")),
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
      left_join: transfer in assoc(link, :transfer),
      where: link.device_id == ^device.id and link.expires_at >= ^now,
      where: is_nil(transfer.id) or is_nil(transfer.recipient_id),
      order_by: [desc: link.created_at],
      preload: [transfer: transfer]
    )
    |> Repo.all()
    |> Enum.filter(&live_link/1)
  end

  @spec delete_short_link(Device.t(), String.t()) :: :ok | {:error, :not_found}
  def delete_short_link(device, code) do
    from(link in ShortLink,
      where: link.code == ^String.upcase(code) and link.device_id == ^device.id
    )
    |> Repo.delete_all()
    |> case do
      {1, _deleted} -> :ok
      _missing -> {:error, :not_found}
    end
  end

  @spec record_event(ShortLink.t(), String.t()) :: :ok
  def record_event(%ShortLink{code: code, device_id: device_id}, kind)
      when kind in ["view", "download"] do
    field = if kind == "view", do: :view_count, else: :download_count

    occurred_at = Time.utc_now()

    %LinkEvent{}
    |> LinkEvent.changeset(%{
      id: Ecto.UUID.generate(),
      code: code,
      kind: kind,
      occurred_at: occurred_at
    })
    |> Repo.insert!()

    {_count, updated} =
      from(link in ShortLink, where: link.code == ^code, select: link)
      |> Repo.update_all(inc: [{field, 1}])

    case updated do
      [%ShortLink{} = link] when is_binary(device_id) ->
        RoomEvents.notify_device(device_id, "short_link_event", %{
          code: link.code,
          kind: kind,
          view_count: link.view_count || 0,
          download_count: link.download_count || 0,
          occurred_at: Time.iso8601(occurred_at)
        })

      _missing ->
        :ok
    end

    :ok
  end

  @spec list_events(Device.t(), pos_integer(), String.t() | nil) :: [map()]
  def list_events(device, days \\ 7, code \\ nil) do
    start_at = DateTime.add(Time.utc_now(), -(days + 1) * 86_400, :second)

    query =
      from(event in LinkEvent,
        join: link in ShortLink,
        on: link.code == event.code,
        where: link.device_id == ^device.id,
        where: event.occurred_at >= ^start_at,
        order_by: [asc: event.occurred_at],
        select: %{occurred_at: event.occurred_at, kind: event.kind}
      )

    query = if code, do: where(query, [_event, link], link.code == ^code), else: query

    Enum.map(Repo.all(query), fn event ->
      %{
        occurred_at: Time.iso8601(event.occurred_at),
        kind: event.kind
      }
    end)
  end

  @spec get_live_short_link(String.t()) :: ShortLink.t() | nil
  def get_live_short_link(code) do
    now = Time.now()

    from(link in ShortLink,
      where: link.code == ^String.upcase(code) and link.expires_at > ^now,
      preload: [:transfer]
    )
    |> Repo.one()
    |> live_link()
  end

  defp live_link(nil), do: nil

  defp live_link(link) do
    if Expiration.live?(link) and
         (is_nil(link.transfer) or live_transfer?(link.transfer)),
       do: link,
       else: nil
  end

  defp live_transfer?(transfer),
    do: Expiration.live?(transfer) and transfer.status not in @hidden_statuses

  @spec expire_stale() :: :ok
  def expire_stale do
    now = Time.now()

    from(transfer in Transfer,
      where: transfer.status in ["pending", "uploaded", "delivered"],
      where: transfer.expires_at < ^now
    )
    |> Repo.all()
    |> Enum.each(fn transfer ->
      if transfer.upload_id, do: Multipart.abort(transfer)
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
      secret: transfer.secret,
      recipient_id: transfer.recipient_id,
      group_id: transfer.group_id,
      kind: transfer.kind,
      filename: transfer.filename,
      byte_size: transfer.byte_size,
      content_type: transfer.content_type,
      status: transfer.status,
      max_downloads: transfer.max_downloads,
      download_count: transfer.download_count,
      expires_at: Time.iso8601(transfer.expires_at),
      created_at: Time.iso8601(transfer.created_at)
    }

    payload =
      if transfer.kind == "text" and viewer.id in [transfer.sender_id, transfer.recipient_id] do
        Map.put(payload, :body, transfer.body)
      else
        payload
      end

    payload =
      if transfer.kind == "text" and not is_nil(transfer.max_downloads) and
           viewer.id != transfer.sender_id and
           not Keyword.get(options, :opened, false),
         do: Map.delete(payload, :body),
         else: payload

    if Keyword.get(options, :download, false) and downloadable?(transfer) do
      Map.put(payload, :download, %{
        url: transfer_download_url(transfer, viewer)
      })
    else
      payload
    end
  end

  @spec short_link_json(ShortLink.t(), keyword()) :: map()
  def short_link_json(link, opts \\ [])

  def short_link_json(%ShortLink{transfer: %Transfer{} = transfer} = link, opts) do
    protected = is_binary(link.password_verifier)

    payload =
      counts_json(link)
      |> Map.merge(%{
        code: link.code,
        expires_at: Time.iso8601(link.expires_at),
        created_at: Time.iso8601(link.created_at),
        kind: transfer.kind,
        password_protected: protected
      })

    if protected and not Keyword.get(opts, :reveal, true) do
      payload
    else
      payload = Map.merge(payload, drop_json(transfer))

      if downloadable?(transfer) do
        path = "/api/v1/short_links/#{link.code}/download"

        path =
          if protected do
            token = Phoenix.Token.sign(AnyshareWeb.Endpoint, @download_token_salt, link.code)
            path <> "?token=" <> URI.encode_www_form(token)
          else
            path
          end

        payload
        |> Map.put(:download, %{url: path})
        |> then(fn payload ->
          if transfer.secret, do: payload, else: Map.put(payload, :track_download, path)
        end)
      else
        payload
      end
    end
  end

  def short_link_json(link, opts) do
    protected = is_binary(link.password_verifier)

    payload =
      counts_json(link)
      |> Map.merge(%{
        code: link.code,
        expires_at: Time.iso8601(link.expires_at),
        created_at: Time.iso8601(link.created_at),
        kind: "url",
        password_protected: protected
      })

    if protected and not Keyword.get(opts, :reveal, true) do
      payload
    else
      Map.put(payload, :url, link.target_url)
    end
  end

  @spec offer_transfer(Transfer.t(), Device.t() | nil) :: :ok
  def offer_transfer(_transfer, nil), do: :ok

  def offer_transfer(transfer, recipient) do
    RoomEvents.notify_device(
      recipient.id,
      "transfer_offered",
      transfer_json(transfer, recipient, download: true)
    )
  end

  @spec deliver_text(Transfer.t(), Device.t() | nil) :: :ok
  def deliver_text(_transfer, nil), do: :ok

  def deliver_text(transfer, recipient) do
    RoomEvents.notify_device(recipient.id, "text_received", transfer_json(transfer, recipient))
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

  defp counts_json(link) do
    %{
      view_count: link.view_count || 0,
      download_count: link.download_count || 0,
      max_downloads: link.max_downloads
    }
  end

  defp drop_json(transfer) do
    payload = %{
      id: transfer.id,
      secret: transfer.secret,
      kind: transfer.kind,
      filename: transfer.filename,
      byte_size: transfer.byte_size,
      content_type: transfer.content_type,
      status: transfer.status,
      max_downloads: transfer.max_downloads,
      expires_at: Time.iso8601(transfer.expires_at)
    }

    if transfer.kind == "text", do: Map.put(payload, :body, transfer.body), else: payload
  end

  defp downloadable?(transfer) do
    live_transfer?(transfer) and transfer.kind == "file" and
      transfer.status in ["uploaded", "delivered"] and
      is_binary(transfer.r2_key) and transfer.r2_key != ""
  end

  defp present(value) when value in [nil, ""], do: nil
  defp present(value), do: value

  defp maybe_put_password(attrs, password) when is_binary(password) and password != "" do
    Map.put(attrs, :password, password)
  end

  defp maybe_put_password(attrs, _password), do: attrs
end
