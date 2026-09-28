defmodule Phemera.Moderation.HashList do
  @moduledoc """
  Known-bad hashes imported from external lists (MalwareBazaar now; NCMEC, StopNCII and
  GIFCT once vetted). Exact hashes match by equality, PDQ by Hamming distance.
  """

  import Ecto.Query

  alias Phemera.Moderation.Signals
  alias Phemera.Repo
  alias Phemera.Time

  # Meta's recommended PDQ match threshold for 256-bit hashes.
  @pdq_threshold 31
  @batch_size 5_000
  @digest_bytes %{"md5" => 16, "sha256" => 32, "pdq" => 32}
  @categories ~w(csam ncii terror malware)

  @type signal_type :: String.t()
  @type match :: %{
          signal_type: signal_type(),
          digest: binary(),
          category: String.t(),
          source: String.t()
        }

  @spec categories() :: [String.t()]
  def categories, do: @categories

  @spec signal_types() :: [signal_type()]
  def signal_types, do: Map.keys(@digest_bytes)

  @spec match(Signals.t()) :: match() | nil
  def match(%Signals{} = signals), do: match_exact(signals) || match_pdq(signals.pdq)

  defp match_exact(signals) do
    from(signal in "hash_signals",
      where:
        (signal.signal_type == "md5" and signal.digest == type(^signals.md5, :binary)) or
          (signal.signal_type == "sha256" and signal.digest == type(^signals.sha256, :binary)),
      select: ^selected(),
      limit: 1
    )
    |> Repo.one()
  end

  defp match_pdq([]), do: nil

  defp match_pdq(hashes) do
    near =
      Enum.reduce(hashes, dynamic(false), fn hash, matches ->
        dynamic(
          [signal],
          ^matches or
            fragment("bit_count(? # ?::bit(256)) <= ?", signal.pdq, ^hash, ^@pdq_threshold)
        )
      end)

    from(signal in "hash_signals",
      where: signal.signal_type == "pdq",
      where: ^near,
      select: ^selected(),
      limit: 1
    )
    |> Repo.one()
  end

  defp selected, do: [:signal_type, :digest, :category, :source]

  @doc """
  Stores `{signal_type, digest}` entries. Existing hashes keep their first category.
  """
  @spec put_entries(Enumerable.t(), String.t(), String.t()) :: {:ok, non_neg_integer()}
  def put_entries(entries, category, source)
      when category in @categories and is_binary(source) and source != "" do
    now = Time.now()

    inserted =
      entries
      |> Stream.map(&row(&1, category, source, now))
      |> Stream.chunk_every(@batch_size)
      |> Enum.reduce(0, fn rows, total ->
        {count, _rows} =
          Repo.insert_all("hash_signals", rows,
            on_conflict: :nothing,
            conflict_target: [:signal_type, :digest]
          )

        total + count
      end)

    {:ok, inserted}
  end

  @doc """
  Imports a text or CSV file with one hex digest per line (the first column).
  """
  @spec import_file(Path.t(), signal_type(), String.t(), String.t()) ::
          {:ok, non_neg_integer()} | {:error, {:invalid_line, pos_integer()}}
  def import_file(path, type, category, source) when is_map_key(@digest_bytes, type) do
    lines = path |> File.stream!() |> Stream.map(&parse_line(&1, type)) |> Stream.with_index(1)

    case Enum.find(lines, fn {entry, _line} -> entry == :error end) do
      {:error, line} ->
        {:error, {:invalid_line, line}}

      nil ->
        lines
        |> Stream.map(fn {entry, _line} -> entry end)
        |> Stream.reject(&is_nil/1)
        |> put_entries(category, source)
    end
  end

  defp row({type, digest}, category, source, now) do
    unless valid_digest?(type, digest), do: raise(ArgumentError, "invalid #{type} digest")

    %{
      signal_type: type,
      digest: digest,
      pdq: if(type == "pdq", do: digest),
      category: category,
      source: source,
      imported_at: now
    }
  end

  defp valid_digest?(type, digest),
    do: is_binary(digest) and byte_size(digest) == Map.get(@digest_bytes, type)

  @doc """
  Parses one line of a hash list: a bare hex digest, optionally followed by a comma or
  whitespace and more columns. Blank lines and `#` comments return nil.
  """
  @spec parse_line(String.t(), signal_type()) :: {signal_type(), binary()} | nil | :error
  def parse_line(line, type) do
    case line |> String.trim() |> String.split([",", " ", "\t"], parts: 2) do
      [""] ->
        nil

      ["#" <> _comment | _rest] ->
        nil

      [hex | _rest] ->
        case Signals.decode_hex(String.trim(hex, "\""), Map.fetch!(@digest_bytes, type)) do
          {:ok, digest} -> {type, digest}
          :error -> :error
        end
    end
  end
end
