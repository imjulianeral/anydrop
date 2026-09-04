defmodule Anyshare.ObjectStore do
  @moduledoc false

  alias Anyshare.ObjectStore.Signer

  @presign_ttl_seconds 15 * 60
  @read_length 1_000_000

  @spec presign_put(String.t(), keyword()) :: map()
  def presign_put(key, options) do
    content_type = Keyword.fetch!(options, :content_type)
    byte_size = Keyword.fetch!(options, :byte_size)

    case r2_config() do
      {:ok, config} ->
        url =
          Signer.presign(config, :put, key,
            expires: @presign_ttl_seconds,
            headers: [
              {"content-length", Integer.to_string(byte_size)},
              {"content-type", content_type}
            ]
          )

        %{url: url, headers: %{"Content-Type" => content_type}}

      :local ->
        %{
          url: "/api/v1/local_blobs/#{encode_key(key)}",
          headers: %{"Content-Type" => content_type}
        }
    end
  end

  @spec presign_get(String.t()) :: String.t()
  def presign_get(key) do
    case r2_config() do
      {:ok, config} -> Signer.presign(config, :get, key, expires: @presign_ttl_seconds)
      :local -> "/api/v1/local_blobs/#{encode_key(key)}"
    end
  end

  @spec delete(String.t()) :: :ok
  def delete(key) do
    case r2_config() do
      {:ok, config} -> delete_remote(config, key)
      :local -> delete_local(key)
    end
  end

  @spec write_local(String.t(), Plug.Conn.t()) :: {:ok, Plug.Conn.t()} | {:error, term()}
  def write_local(key, conn) do
    with {:ok, path} <- local_path(key),
         :ok <- File.mkdir_p(Path.dirname(path)),
         {:ok, file} <- File.open(path, [:write, :binary]) do
      try do
        copy_request_body(conn, file)
      after
        File.close(file)
      end
    end
  end

  @spec local_file(String.t()) :: {:ok, String.t()} | {:error, term()}
  def local_file(key) do
    with {:ok, path} <- local_path(key),
         true <- File.regular?(path) do
      {:ok, path}
    else
      false -> {:error, :not_found}
      error -> error
    end
  end

  defp copy_request_body(conn, file) do
    case Plug.Conn.read_body(conn,
           length: @read_length,
           read_length: @read_length,
           read_timeout: 60_000
         ) do
      {:ok, chunk, next_conn} ->
        :ok = IO.binwrite(file, chunk)
        {:ok, next_conn}

      {:more, chunk, next_conn} ->
        :ok = IO.binwrite(file, chunk)
        copy_request_body(next_conn, file)

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp delete_local(key) do
    with {:ok, path} <- local_path(key),
         true <- File.exists?(path) do
      File.rm(path)
      :ok
    else
      _not_present -> :ok
    end
  end

  defp delete_remote(config, key) do
    {url, headers} = Signer.signed_delete(config, key)

    request = {
      String.to_charlist(url),
      Enum.map(headers, fn {name, value} ->
        {String.to_charlist(name), String.to_charlist(value)}
      end)
    }

    _response = :httpc.request(:delete, request, [connect_timeout: 5_000, timeout: 5_000], [])
    :ok
  rescue
    _error -> :ok
  end

  defp local_path(key) do
    segments = String.split(key, "/", trim: false)
    safe_segments = Enum.all?(segments, &safe_segment?/1)

    if safe_segments and List.first(segments) == "transfers" do
      root = Application.get_env(:anyshare, :storage_path, Path.expand("tmp/storage"))
      path = Path.join([root | segments]) |> Path.expand()

      if String.starts_with?(path, root <> "/"), do: {:ok, path}, else: {:error, :invalid_key}
    else
      {:error, :invalid_key}
    end
  end

  defp safe_segment?(segment),
    do: segment not in ["", ".", ".."] and not String.contains?(segment, <<0>>)

  defp encode_key(key), do: URI.encode(key, &URI.char_unreserved?/1)

  defp r2_config do
    config = Application.get_env(:anyshare, :r2, %{})

    keys = [:access_key_id, :secret_access_key, :bucket, :endpoint]

    if Enum.all?(keys, fn key -> present?(Map.get(config, key)) end) do
      {:ok, config}
    else
      :local
    end
  end

  defp present?(value), do: is_binary(value) and value != ""
end
