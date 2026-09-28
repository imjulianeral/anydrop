defmodule Phemera.Moderation do
  @moduledoc """
  Upload-time content screening.

  Uploads are end-to-end encrypted, so the server only sees hashes the sender's browser
  computed from the plaintext. Short-link destinations are plaintext and go to Web Risk.
  """

  require Logger

  alias Phemera.Accounts.Device
  alias Phemera.Moderation.Event
  alias Phemera.Moderation.HashList
  alias Phemera.Moderation.Signals
  alias Phemera.Moderation.WebRisk
  alias Phemera.Repo
  alias Phemera.Sharing.Transfer
  alias Phemera.Time

  @doc """
  Matches upload signals against the hash lists. Clean signals are discarded; a match is
  recorded as evidence.
  """
  @spec screen_upload(Transfer.t(), Signals.t() | nil) :: :ok | {:blocked, HashList.match()}
  def screen_upload(_transfer, nil), do: :ok

  def screen_upload(%Transfer{} = transfer, %Signals{} = signals) do
    case HashList.match(signals) do
      nil ->
        :ok

      match ->
        record!(%{
          action: "blocked_upload",
          transfer_id: transfer.id,
          device_id: transfer.sender_id,
          signal_type: match.signal_type,
          digest: match.digest,
          category: match.category,
          source: match.source
        })

        {:blocked, match}
    end
  end

  @doc """
  Checks a short-link destination. Fails open when Web Risk is unreachable so link
  creation keeps working.
  """
  @spec screen_url(Device.t(), String.t()) :: :ok | {:blocked, [String.t()]}
  def screen_url(%Device{} = device, url) do
    if web_url?(url) do
      case WebRisk.lookup(url) do
        {:ok, []} ->
          :ok

        {:ok, threats} ->
          record!(%{
            action: "blocked_url",
            device_id: device.id,
            target_url: url,
            category: Enum.join(threats, ","),
            source: "web_risk"
          })

          {:blocked, threats}

        {:error, reason} ->
          Logger.warning("Web Risk lookup failed: #{inspect(reason)}")
          :ok
      end
    else
      :ok
    end
  end

  defp web_url?(url) do
    case URI.new(url) do
      {:ok, %URI{scheme: scheme, host: host}}
      when scheme in ["http", "https"] and is_binary(host) and host != "" ->
        true

      _invalid ->
        false
    end
  end

  defp record!(attrs) do
    Repo.insert!(struct!(Event, Map.put(attrs, :created_at, Time.now())))
  end
end
