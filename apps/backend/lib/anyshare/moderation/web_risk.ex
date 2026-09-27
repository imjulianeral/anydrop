defmodule Anyshare.Moderation.WebRisk do
  @moduledoc """
  Google Web Risk Lookup API (`uris.search`). Free for 100k lookups a month.
  """

  @endpoint "https://webrisk.googleapis.com/v1/uris:search"
  @threat_types ~w(MALWARE SOCIAL_ENGINEERING UNWANTED_SOFTWARE)

  @doc """
  Returns the threat types Google lists for `url`, or `[]` when it is clean or Web Risk
  is not configured.
  """
  @spec lookup(String.t()) :: {:ok, [String.t()]} | {:error, term()}
  def lookup(url) do
    case config() do
      %{api_key: key} = config when is_binary(key) and key != "" -> search(config, url)
      _config -> {:ok, []}
    end
  end

  defp search(config, url) do
    query =
      URI.encode_query(
        Enum.map(@threat_types, &{"threatTypes", &1}) ++ [{"uri", url}, {"key", config.api_key}]
      )

    request = {to_charlist("#{Map.get(config, :endpoint, @endpoint)}?#{query}"), []}

    case :httpc.request(:get, request, http_options(), body_format: :binary) do
      {:ok, {{_version, 200, _reason}, _headers, body}} ->
        threats(body)

      {:ok, {{_version, status, _reason}, _headers, _body}} ->
        {:error, {:web_risk_status, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp threats(body) do
    case Jason.decode(body) do
      {:ok, %{"threat" => %{"threatTypes" => types}}} when is_list(types) -> {:ok, types}
      {:ok, %{}} -> {:ok, []}
      _invalid -> {:error, :invalid_response}
    end
  end

  defp http_options do
    [
      connect_timeout: 3_000,
      timeout: 5_000,
      autoredirect: false,
      ssl: [
        verify: :verify_peer,
        cacerts: :public_key.cacerts_get(),
        customize_hostname_check: [
          match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
        ]
      ]
    ]
  end

  defp config, do: Application.get_env(:anyshare, :web_risk, %{})
end
