defmodule Anyshare.Moderation.Sync do
  @moduledoc """
  Refreshes hash lists from each configured source on boot and then every hour.

  Add NCMEC, StopNCII, and GIFCT here as sources once their vetting is approved.
  """

  use GenServer

  require Logger

  @callback enabled?() :: boolean()
  @callback sync() :: {:ok, non_neg_integer()} | {:error, term()}

  @sources [Anyshare.Moderation.MalwareBazaar]
  @first_run :timer.seconds(30)
  @interval :timer.hours(1)

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(options), do: GenServer.start_link(__MODULE__, options, name: __MODULE__)

  @spec run() :: :ok
  def run do
    for source <- @sources, source.enabled?() do
      case source.sync() do
        {:ok, count} ->
          Logger.info("hash list sync #{inspect(source)} added #{count} hashes")

        {:error, reason} ->
          Logger.warning("hash list sync #{inspect(source)} failed: #{inspect(reason)}")
      end
    end

    :ok
  end

  @impl true
  def init(_options) do
    Process.send_after(self(), :sync, @first_run)
    {:ok, nil}
  end

  @impl true
  def handle_info(:sync, state) do
    run()
    Process.send_after(self(), :sync, @interval)
    {:noreply, state}
  end
end
