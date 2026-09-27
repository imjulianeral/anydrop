defmodule Anyshare.Moderation.Signals do
  @moduledoc """
  Hashes of a file's plaintext, computed by the sender's browser before encryption.

  The server matches them against hash lists and keeps them only when they match.
  """

  # Meta recommends ignoring PDQ hashes below this quality score.
  @min_pdq_quality 50
  @max_pdq_hashes 64

  defstruct [:md5, :sha256, pdq: []]

  @type t :: %__MODULE__{md5: binary(), sha256: binary(), pdq: [binary()]}

  @spec parse(term()) :: {:ok, t()} | {:error, :invalid_signals}
  def parse(%{"md5" => md5, "sha256" => sha256} = params) do
    with {:ok, md5} <- decode_hex(md5, 16),
         {:ok, sha256} <- decode_hex(sha256, 32),
         {:ok, pdq} <- parse_pdq(Map.get(params, "pdq", [])) do
      {:ok, %__MODULE__{md5: md5, sha256: sha256, pdq: pdq}}
    else
      _error -> {:error, :invalid_signals}
    end
  end

  def parse(_params), do: {:error, :invalid_signals}

  @spec decode_hex(term(), pos_integer()) :: {:ok, binary()} | :error
  def decode_hex(value, bytes) when is_binary(value) and byte_size(value) == bytes * 2,
    do: Base.decode16(value, case: :mixed)

  def decode_hex(_value, _bytes), do: :error

  defp parse_pdq(entries) when is_list(entries) and length(entries) <= @max_pdq_hashes do
    Enum.reduce_while(entries, {:ok, []}, fn entry, {:ok, hashes} ->
      case parse_pdq_entry(entry) do
        {:ok, nil} -> {:cont, {:ok, hashes}}
        {:ok, hash} -> {:cont, {:ok, [hash | hashes]}}
        :error -> {:halt, :error}
      end
    end)
    |> case do
      {:ok, hashes} -> {:ok, hashes |> Enum.reverse() |> Enum.uniq()}
      :error -> :error
    end
  end

  defp parse_pdq(_entries), do: :error

  defp parse_pdq_entry(%{"hash" => hash, "quality" => quality})
       when is_integer(quality) and quality in 0..100 do
    case decode_hex(hash, 32) do
      {:ok, _hash} when quality < @min_pdq_quality -> {:ok, nil}
      {:ok, hash} -> {:ok, hash}
      :error -> :error
    end
  end

  defp parse_pdq_entry(_entry), do: :error
end
