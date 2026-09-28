defmodule Phemera.Uploads do
  @moduledoc false

  import Ecto.Query, only: [from: 2]

  alias Phemera.Moderation
  alias Phemera.ObjectStore
  alias Phemera.ObjectStore.Multipart
  alias Phemera.Repo
  alias Phemera.Sharing.Transfer
  alias Phemera.Time

  def start(sender, id) do
    with_transfer(sender, id, fn transfer ->
      if is_nil(transfer.upload_part_size), do: Repo.rollback(:not_multipart)

      transfer =
        if transfer.upload_id do
          transfer
        else
          upload_id = unwrap(Multipart.start(transfer))
          update(transfer, %{upload_id: upload_id})
        end

      %{
        type: "multipart",
        part_size: transfer.upload_part_size,
        part_count: Multipart.part_count(transfer)
      }
    end)
  end

  def part(sender, id, number) do
    with_transfer(sender, id, fn transfer ->
      if is_nil(transfer.upload_id), do: Repo.rollback(:not_multipart)
      unwrap(Multipart.presign_part(transfer, number))
    end)
  end

  def complete(sender, id, parts, signals \\ nil) do
    sender
    |> with_transfer(
      id,
      fn transfer ->
        if transfer.status == "pending", do: finish(transfer, parts, signals), else: transfer
      end,
      completed: true
    )
    |> case do
      {:ok, :blocked} -> {:error, :blocked}
      result -> result
    end
  end

  # Screening runs before the multipart commit, so a match never becomes a readable object.
  defp finish(transfer, parts, signals) do
    case Moderation.screen_upload(transfer, signals) do
      :ok -> store(transfer, parts)
      {:blocked, _match} -> block(transfer)
    end
  end

  defp block(transfer) do
    # Best effort: the bucket lifecycle removes anything a failed cleanup leaves behind.
    if transfer.upload_id,
      do: Multipart.abort(transfer),
      else: ObjectStore.delete(transfer.r2_key)

    update(transfer, %{status: "blocked", upload_id: nil})
    :blocked
  end

  defp store(transfer, parts) do
    if transfer.upload_part_size do
      if is_nil(transfer.upload_id), do: Repo.rollback(:not_multipart)

      case Multipart.complete(transfer, parts) do
        :ok -> :ok
        {:error, reason} -> Repo.rollback(reason)
      end
    end

    update(transfer, %{status: "uploaded"})
  end

  def abort(sender, id) do
    with_transfer(sender, id, fn transfer ->
      case Multipart.abort(transfer) do
        :ok -> update(transfer, %{status: "failed", upload_id: nil})
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp with_transfer(sender, id, fun, options \\ []) do
    Repo.transaction(
      fn ->
        transfer =
          from(transfer in Transfer,
            where: transfer.id == ^id and transfer.sender_id == ^sender.id,
            lock: "FOR UPDATE"
          )
          |> Repo.one()

        cond do
          is_nil(transfer) ->
            Repo.rollback(:not_found)

          transfer.status != "pending" and
              not (Keyword.get(options, :completed, false) and
                       transfer.status in ["uploaded", "delivered"]) ->
            Repo.rollback(:already_completed)

          NaiveDateTime.compare(transfer.expires_at, Time.now()) != :gt ->
            Repo.rollback(:expired)

          transfer.kind != "file" ->
            Repo.rollback(:not_multipart)

          true ->
            fun.(transfer)
        end
      end,
      timeout: 180_000
    )
  end

  defp update(transfer, attrs),
    do: transfer |> Transfer.changeset(attrs) |> Repo.update() |> unwrap()

  defp unwrap({:ok, value}), do: value
  defp unwrap({:error, reason}), do: Repo.rollback(reason)
end
