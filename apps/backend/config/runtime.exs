import Config

unwrap_redacted = fn
  nil ->
    nil

  "{" <> _ = encoded ->
    case Jason.decode(encoded) do
      {:ok, %{"_tag" => "Redacted", "value" => value}} when is_binary(value) -> value
      _ -> encoded
    end

  value ->
    value
end

if System.get_env("PHX_SERVER") in ~w(true 1) do
  config :anyshare, AnyshareWeb.Endpoint, server: true
end

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL")
    |> unwrap_redacted.()
    |> then(fn value ->
      if is_binary(value) and String.match?(value, ~r/^postgres(?:ql)?:\/\//i) do
        value
      else
        raise "DATABASE_URL must be a PostgreSQL URL"
      end
    end)

  secret_key_base =
    System.get_env("SECRET_KEY_BASE")
    |> unwrap_redacted.()
    |> then(fn
      value when is_binary(value) and byte_size(value) >= 64 -> value
      _ -> raise "SECRET_KEY_BASE must contain at least 64 bytes"
    end)

  config :anyshare, Anyshare.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: if(System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: [])

  config :anyshare, AnyshareWeb.Endpoint,
    http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT") || "8080")],
    secret_key_base: secret_key_base,
    check_origin: false,
    server: true
end

config :anyshare,
  allowed_origins: System.get_env("ALLOWED_ORIGINS", ""),
  expire_secret: unwrap_redacted.(System.get_env("EXPIRE_SECRET")),
  r2: %{
    access_key_id: unwrap_redacted.(System.get_env("R2_ACCESS_KEY_ID")),
    secret_access_key: unwrap_redacted.(System.get_env("R2_SECRET_ACCESS_KEY")),
    bucket: System.get_env("R2_BUCKET"),
    endpoint: System.get_env("R2_ENDPOINT"),
    region: System.get_env("R2_REGION", "auto")
  }
