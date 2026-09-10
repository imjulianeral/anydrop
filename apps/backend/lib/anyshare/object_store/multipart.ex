defmodule Anyshare.ObjectStore.Multipart do
  @moduledoc false

  alias Anyshare.ObjectStore
  alias Anyshare.ObjectStore.Signer

  @threshold 64 * 1024 * 1024
  @part_size 16 * 1024 * 1024
  @mib 1024 * 1024
  @max_parts 10_000

  def part_size(byte_size) when is_integer(byte_size) and byte_size > @threshold do
    case ObjectStore.r2_config() do
      {:ok, _config} ->
        max(@part_size, div(byte_size + @max_parts * @mib - 1, @max_parts * @mib) * @mib)

      :local ->
        nil
    end
  end

  def part_size(_byte_size), do: nil

  def part_count(transfer),
    do: div(transfer.byte_size + transfer.upload_part_size - 1, transfer.upload_part_size)

  def start(transfer) do
    with {:ok, %{body: body}} <-
           request(:post, transfer.r2_key,
             query: [{"uploads", ""}],
             content_type: transfer.content_type || "application/octet-stream"
           ),
         {:ok, id} <- xml_value(body, "InitiateMultipartUploadResult", "UploadId") do
      {:ok, id}
    end
  end

  def presign_part(transfer, number) when is_integer(number) and number > 0 do
    if number <= part_count(transfer) do
      with {:ok, config} <- ObjectStore.r2_config() do
        {:ok,
         %{
           url:
             Signer.presign(config, :put, transfer.r2_key,
               query: [{"uploadId", transfer.upload_id}, {"partNumber", to_string(number)}]
             ),
           headers: %{}
         }}
      else
        _ -> {:error, :storage_unavailable}
      end
    else
      {:error, :invalid_parts}
    end
  end

  def presign_part(_transfer, _number), do: {:error, :invalid_parts}

  def complete(transfer, parts) do
    with {:ok, parts} <- validate_parts(transfer, parts) do
      body =
        Enum.map_join(parts, "", fn %{"part_number" => number, "etag" => etag} ->
          "<Part><PartNumber>#{number}</PartNumber><ETag>#{etag}</ETag></Part>"
        end)

      result =
        with {:ok, %{body: response}} <-
               request(:post, transfer.r2_key,
                 query: [{"uploadId", transfer.upload_id}],
                 body: "<CompleteMultipartUpload>#{body}</CompleteMultipartUpload>"
               ),
             {:ok, _etag} <- xml_value(response, "CompleteMultipartUploadResult", "ETag") do
          :ok
        end

      # A lost completion response can leave the object complete in R2.
      # HEAD also checks the declared size before the transfer becomes visible.
      case verify_object(transfer, parts) do
        :ok -> :ok
        {:error, _reason} -> if result == :ok, do: {:error, :storage_unavailable}, else: result
      end
    end
  end

  def abort(%{upload_id: nil}), do: :ok

  def abort(transfer) do
    case request(:delete, transfer.r2_key, query: [{"uploadId", transfer.upload_id}]) do
      {:ok, _response} -> :ok
      {:error, {:storage_status, 404}} -> :ok
      _error -> {:error, :storage_unavailable}
    end
  end

  defp validate_parts(transfer, parts) when is_list(parts) do
    valid =
      length(parts) == part_count(transfer) and
        Enum.with_index(parts, 1)
        |> Enum.all?(fn
          {%{"part_number" => number, "etag" => etag}, index}
          when is_integer(number) and is_binary(etag) ->
            number == index and Regex.match?(~r/\A"?[a-fA-F0-9]{32}"?\z/, etag)

          _ ->
            false
        end)

    if valid, do: {:ok, parts}, else: {:error, :invalid_parts}
  end

  defp validate_parts(_transfer, _parts), do: {:error, :invalid_parts}

  defp verify_object(transfer, parts) do
    hashes =
      Enum.map_join(parts, fn %{"etag" => etag} ->
        etag |> String.trim("\"") |> Base.decode16!(case: :mixed)
      end)

    etag = Base.encode16(:crypto.hash(:md5, hashes), case: :lower) <> "-#{length(parts)}"

    with {:ok, %{headers: headers}} <- request(:head, transfer.r2_key),
         true <- header(headers, "content-length") == to_string(transfer.byte_size),
         true <- String.trim(header(headers, "etag"), "\"") == etag do
      :ok
    else
      _ -> {:error, :storage_unavailable}
    end
  end

  defp header(headers, name) do
    Enum.find_value(headers, "", fn {key, value} ->
      if String.downcase(to_string(key)) == name, do: to_string(value)
    end)
  end

  defp request(method, key, options \\ []) do
    with {:ok, config} <- ObjectStore.r2_config() do
      content_type = Keyword.get(options, :content_type, "application/xml")
      body = Keyword.get(options, :body, "")

      signed_options =
        if method == :post,
          do: Keyword.put(options, :headers, [{"content-type", content_type}]),
          else: options

      {url, headers} = Signer.signed_request(config, method, key, signed_options)
      headers = Enum.map(headers, fn {key, value} -> {to_charlist(key), to_charlist(value)} end)

      request =
        if method == :post,
          do: {to_charlist(url), headers, to_charlist(content_type), body},
          else: {to_charlist(url), headers}

      case :httpc.request(
             method,
             request,
             [
               connect_timeout: 5_000,
               timeout: 60_000,
               autoredirect: false,
               ssl: [
                 verify: :verify_peer,
                 cacerts: :public_key.cacerts_get(),
                 customize_hostname_check: [
                   match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
                 ]
               ]
             ],
             body_format: :binary
           ) do
        {:ok, {{_version, status, _reason}, headers, body}} when status in 200..299 ->
          {:ok, %{headers: headers, body: body}}

        {:ok, {{_version, status, _reason}, _headers, _body}} ->
          {:error, {:storage_status, status}}

        _ ->
          {:error, :storage_unavailable}
      end
    else
      _ -> {:error, :storage_unavailable}
    end
  end

  defp xml_value(body, root, field) do
    if String.contains?(body, "<!") do
      {:error, :storage_unavailable}
    else
      {document, _rest} = :xmerl_scan.string(to_charlist(body), quiet: true)
      path = ~c'string(/*[local-name()="#{root}"]/*[local-name()="#{field}"])'

      case :xmerl_xpath.string(path, document) do
        {:xmlObj, :string, value} when value != [] -> {:ok, to_string(value)}
        _ -> {:error, :storage_unavailable}
      end
    end
  catch
    _kind, _reason -> {:error, :storage_unavailable}
  end
end
