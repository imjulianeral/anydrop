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

r2 = %{
  access_key_id: unwrap_redacted.(System.get_env("R2_ACCESS_KEY_ID")),
  secret_access_key: unwrap_redacted.(System.get_env("R2_SECRET_ACCESS_KEY")),
  bucket: System.get_env("R2_BUCKET"),
  endpoint: System.get_env("R2_ENDPOINT"),
  region: System.get_env("R2_REGION", "auto")
}

alchemy_dev? = System.get_env("ALCHEMY_DEV") in ~w(true 1)

if config_env() == :prod and not alchemy_dev? do
  for key <- [:access_key_id, :secret_access_key, :bucket, :endpoint] do
    unless is_binary(r2[key]) and r2[key] != "" do
      raise "R2_#{key |> Atom.to_string() |> String.upcase()} is required in production"
    end
  end
end

config :anyshare,
  allowed_origins: System.get_env("ALLOWED_ORIGINS", ""),
  expire_secret: unwrap_redacted.(System.get_env("EXPIRE_SECRET")),
  r2: r2

auth_origin = System.get_env("AUTH_ORIGIN", "http://localhost:3000") |> URI.decode()
auth_uri = URI.parse(auth_origin)
google_client_id = System.get_env("GOOGLE_CLIENT_ID") |> unwrap_redacted.()

if config_env() == :prod and not alchemy_dev? and google_client_id not in [nil, ""] and
     auth_uri.scheme != "https" do
  raise "Set AUTH_ORIGIN to the HTTPS website origin before enabling Google sign-in in production"
end

unless auth_uri.scheme in ["http", "https"] and is_binary(auth_uri.host) and
         auth_uri.path in [nil, ""] and is_nil(auth_uri.query) and
         is_nil(auth_uri.fragment) and is_nil(auth_uri.userinfo) and
         (auth_uri.scheme == "https" or auth_uri.host in ["localhost", "127.0.0.1"]) do
  raise "AUTH_ORIGIN must be an HTTPS origin (HTTP is allowed on localhost) without a trailing slash"
end

config :anyshare, :auth,
  origin: auth_origin,
  client_id: google_client_id,
  client_secret: System.get_env("GOOGLE_CLIENT_SECRET") |> unwrap_redacted.()

config :phoenix, :filter_parameters, [
  "password",
  "token",
  "secret",
  "code",
  "state",
  "clientDataJSON",
  "attestationObject",
  "signature"
]
