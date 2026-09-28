defmodule Phemera.Usage do
  @moduledoc """
  Daily usage counters per device: links created, views, downloads and nearby
  sends, split by kind (`url`, `text`, `file`). They outlive the links they
  count, so the dashboard keeps a year of history after links expire. Only
  numbers are stored, never content, names or URLs.
  """
  import Ecto.Query

  require Logger

  alias Phemera.Repo

  @kinds ~w(url text file)
  @metrics ~w(created view download sent received)
  @retention_days 400

  @spec track(String.t() | nil, String.t() | nil, String.t(), non_neg_integer()) :: :ok
  def track(device_id, kind, metric, bytes \\ 0)

  def track(device_id, kind, metric, bytes)
      when is_binary(device_id) and kind in @kinds and metric in @metrics do
    Repo.insert_all(
      "usage_daily",
      [
        %{
          device_id: device_id,
          day: Date.utc_today(),
          kind: kind,
          metric: metric,
          count: 1,
          bytes: bytes || 0
        }
      ],
      on_conflict: [inc: [count: 1, bytes: bytes || 0]],
      conflict_target: [:device_id, :day, :kind, :metric]
    )

    :ok
  rescue
    error ->
      # Counting must never break sharing.
      Logger.warning("usage tracking failed: #{Exception.message(error)}")
      :ok
  end

  def track(_device_id, _kind, _metric, _bytes), do: :ok

  @doc "Drops counters older than the retention window."
  @spec prune(pos_integer()) :: :ok
  def prune(days \\ @retention_days) do
    cutoff = Date.add(Date.utc_today(), -days)
    Repo.delete_all(from(row in "usage_daily", where: row.day < ^cutoff))
    :ok
  end

  @doc """
  Counters for the given devices between two days (inclusive), one row per day,
  kind and metric, summed across devices.
  """
  @spec rows([String.t()], Date.t(), Date.t()) :: [map()]
  def rows([], _from, _to), do: []

  def rows(device_ids, from, to) do
    Repo.all(
      from(row in "usage_daily",
        where: row.device_id in ^device_ids and row.day >= ^from and row.day <= ^to,
        group_by: [row.day, row.kind, row.metric],
        order_by: [asc: row.day],
        select: %{
          day: row.day,
          kind: row.kind,
          metric: row.metric,
          count: type(sum(row.count), :integer),
          bytes: type(sum(row.bytes), :integer)
        }
      )
    )
  end

  @doc "The kind a short link counts under, or nil when it can't be told."
  @spec link_kind(map()) :: String.t() | nil
  def link_kind(%{target_url: url}) when is_binary(url), do: "url"
  def link_kind(%{transfer: %{kind: kind}}) when kind in @kinds, do: kind
  def link_kind(_link), do: nil
end
