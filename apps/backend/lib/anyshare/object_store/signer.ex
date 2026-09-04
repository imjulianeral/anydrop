defmodule Anyshare.ObjectStore.Signer do
  @moduledoc false

  @algorithm "AWS4-HMAC-SHA256"
  @service "s3"
  @unsigned_payload "UNSIGNED-PAYLOAD"

  @type config :: %{
          required(:access_key_id) => String.t(),
          required(:secret_access_key) => String.t(),
          required(:bucket) => String.t(),
          required(:endpoint) => String.t(),
          required(:region) => String.t()
        }

  @spec presign(config(), :get | :put, String.t(), keyword()) :: String.t()
  def presign(config, method, key, options \\ []) do
    now = Keyword.get(options, :now, DateTime.utc_now())
    expires = Keyword.get(options, :expires, 900)
    headers = Keyword.get(options, :headers, [])
    uri = URI.parse(config.endpoint)
    canonical_uri = object_path(uri.path, config.bucket, key)
    host = authority(uri)
    amz_date = Calendar.strftime(now, "%Y%m%dT%H%M%SZ")
    date = Calendar.strftime(now, "%Y%m%d")
    scope = "#{date}/#{config.region}/#{@service}/aws4_request"

    signed_headers = normalize_headers([{"host", host} | headers])
    signed_header_names = Enum.map_join(signed_headers, ";", &elem(&1, 0))

    query =
      canonical_query([
        {"X-Amz-Algorithm", @algorithm},
        {"X-Amz-Credential", "#{config.access_key_id}/#{scope}"},
        {"X-Amz-Date", amz_date},
        {"X-Amz-Expires", Integer.to_string(expires)},
        {"X-Amz-SignedHeaders", signed_header_names}
      ])

    canonical_request =
      canonical_request(method, canonical_uri, query, signed_headers, @unsigned_payload)

    signature = signature(config.secret_access_key, date, config.region, scope, canonical_request)

    "#{uri.scheme}://#{uri.authority}#{canonical_uri}?#{query}&X-Amz-Signature=#{signature}"
  end

  @spec signed_delete(config(), String.t(), keyword()) :: {String.t(), [{String.t(), String.t()}]}
  def signed_delete(config, key, options \\ []) do
    now = Keyword.get(options, :now, DateTime.utc_now())
    uri = URI.parse(config.endpoint)
    canonical_uri = object_path(uri.path, config.bucket, key)
    host = authority(uri)
    amz_date = Calendar.strftime(now, "%Y%m%dT%H%M%SZ")
    date = Calendar.strftime(now, "%Y%m%d")
    payload_hash = sha256("")
    scope = "#{date}/#{config.region}/#{@service}/aws4_request"

    signed_headers =
      normalize_headers([
        {"host", host},
        {"x-amz-content-sha256", payload_hash},
        {"x-amz-date", amz_date}
      ])

    signed_header_names = Enum.map_join(signed_headers, ";", &elem(&1, 0))

    canonical_request =
      canonical_request(:delete, canonical_uri, "", signed_headers, payload_hash)

    signature = signature(config.secret_access_key, date, config.region, scope, canonical_request)

    authorization =
      "#{@algorithm} Credential=#{config.access_key_id}/#{scope}, " <>
        "SignedHeaders=#{signed_header_names}, Signature=#{signature}"

    url = "#{uri.scheme}://#{uri.authority}#{canonical_uri}"

    {url,
     [
       {"authorization", authorization},
       {"host", host},
       {"x-amz-content-sha256", payload_hash},
       {"x-amz-date", amz_date}
     ]}
  end

  defp canonical_request(method, uri, query, headers, payload_hash) do
    canonical_headers = Enum.map_join(headers, "", fn {name, value} -> "#{name}:#{value}\n" end)
    signed_header_names = Enum.map_join(headers, ";", &elem(&1, 0))

    [
      method |> Atom.to_string() |> String.upcase(),
      uri,
      query,
      canonical_headers,
      signed_header_names,
      payload_hash
    ]
    |> Enum.join("\n")
  end

  defp signature(secret, date, region, scope, canonical_request) do
    string_to_sign =
      [@algorithm, scope_date(scope), scope, sha256(canonical_request)]
      |> Enum.join("\n")

    secret
    |> hmac("AWS4#{secret}", date)
    |> hmac(region)
    |> hmac(@service)
    |> hmac("aws4_request")
    |> hmac(string_to_sign)
    |> Base.encode16(case: :lower)
  end

  defp hmac(_ignored, key, data), do: :crypto.mac(:hmac, :sha256, key, data)
  defp hmac(key, data), do: :crypto.mac(:hmac, :sha256, key, data)

  defp scope_date(scope), do: scope |> String.split("/", parts: 2) |> hd()

  defp canonical_query(values) do
    values
    |> Enum.map(fn {key, value} -> {percent_encode(key), percent_encode(value)} end)
    |> Enum.sort()
    |> Enum.map_join("&", fn {key, value} -> "#{key}=#{value}" end)
  end

  defp normalize_headers(headers) do
    headers
    |> Enum.map(fn {name, value} ->
      normalized_value = value |> to_string() |> String.trim() |> String.replace(~r/\s+/u, " ")
      {String.downcase(to_string(name)), normalized_value}
    end)
    |> Enum.sort()
  end

  defp object_path(endpoint_path, bucket, key) do
    prefix = endpoint_path |> to_string() |> String.trim_trailing("/")
    encoded_key = key |> String.split("/", trim: false) |> Enum.map_join("/", &percent_encode/1)
    "#{prefix}/#{percent_encode(bucket)}/#{encoded_key}"
  end

  defp authority(%URI{authority: authority}) when is_binary(authority), do: authority

  defp authority(%URI{host: host, port: nil}), do: host
  defp authority(%URI{host: host, port: port}), do: "#{host}:#{port}"

  defp percent_encode(value), do: URI.encode(to_string(value), &URI.char_unreserved?/1)
  defp sha256(value), do: :crypto.hash(:sha256, value) |> Base.encode16(case: :lower)
end
