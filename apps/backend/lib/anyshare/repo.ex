defmodule Anyshare.Repo do
  use Ecto.Repo,
    otp_app: :anyshare,
    adapter: Ecto.Adapters.Postgres

  @impl true
  def init(_context, config) do
    {:ok, configure(config)}
  end

  @spec configure(keyword()) :: keyword()
  def configure(config) do
    url = unwrap(Keyword.get(config, :url))
    sslmode = sslmode(config, url)

    config
    |> Keyword.delete(:sslmode)
    |> maybe_put_url(url)
    |> Keyword.put(:ssl, ssl_option(sslmode))
  end

  defp maybe_put_url(config, url) when is_binary(url), do: Keyword.put(config, :url, url)
  defp maybe_put_url(config, _url), do: config

  defp sslmode(config, url) do
    case Keyword.get(config, :sslmode) do
      value when is_binary(value) -> value
      _other -> url |> query_params() |> Map.get("sslmode")
    end
  end

  defp ssl_option(mode) when mode in [nil, "disable", "allow", "prefer"], do: false
  defp ssl_option("require"), do: [verify: :verify_none]
  defp ssl_option(_verify), do: true

  defp query_params(url) when is_binary(url) do
    case URI.parse(url).query do
      nil -> %{}
      query -> URI.decode_query(query)
    end
  end

  defp query_params(_url), do: %{}

  defp unwrap("{" <> _rest = encoded) do
    case Jason.decode(encoded) do
      {:ok, %{"_tag" => "Redacted", "value" => value}} when is_binary(value) -> value
      _invalid -> encoded
    end
  end

  defp unwrap(value), do: value
end
