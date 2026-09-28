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
  config :phemera, PhemeraWeb.Endpoint, server: true
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

  config :phemera, Phemera.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: if(System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: [])

  config :phemera, PhemeraWeb.Endpoint,
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

config :phemera,
  allowed_origins: System.get_env("ALLOWED_ORIGINS", ""),
  expire_secret: unwrap_redacted.(System.get_env("EXPIRE_SECRET")),
  r2: r2,
  web_risk: %{api_key: unwrap_redacted.(System.get_env("WEB_RISK_API_KEY"))},
  malware_bazaar: %{auth_key: unwrap_redacted.(System.get_env("MALWARE_BAZAAR_AUTH_KEY"))}

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

config :phemera, :auth,
  origin: auth_origin,
  client_id: google_client_id,
  client_secret: System.get_env("GOOGLE_CLIENT_SECRET") |> unwrap_redacted.()

# Alchemy passes unset settings as "", so treat blank values as missing.
env_present = fn name ->
  case System.get_env(name) |> unwrap_redacted.() do
    value when value in [nil, ""] -> nil
    value -> value
  end
end

mail_from = env_present.("MAIL_FROM")

mail_address =
  case mail_from &&
         Regex.run(~r/^\s*(?:(.+?)\s*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))\s*$/u, mail_from) do
    nil -> nil
    [_, name, address] -> {name, address}
    [_, "", "", address] -> {"Phemera", address}
  end

if mail_from && is_nil(mail_address) do
  raise ~s(MAIL_FROM must be an address like "Phemera <no-reply@example.com>")
end

if mail_address, do: config(:phemera, :mail_from, mail_address)

if config_env() == :prod do
  mail_relay = env_present.("MAIL_RELAY")
  dkim_key = env_present.("MAIL_DKIM_PRIVATE_KEY")

  dkim =
    if dkim_key && mail_address do
      [
        s: env_present.("MAIL_DKIM_SELECTOR") || "phemera",
        d: mail_address |> elem(1) |> String.split("@") |> List.last(),
        private_key: {:pem_plain, String.replace(dkim_key, "\\n", "\n")}
      ]
    end

  cond do
    is_nil(mail_address) ->
      # Without a sender identity, log invitations instead of sending them.
      # The team panel still shows each invitation link.
      config :phemera, Phemera.Mailer, adapter: Swoosh.Adapters.Logger, log_full_email: true

    mail_relay ->
      # Optional escape hatch if outbound port 25 is blocked where this runs.
      config :phemera,
             Phemera.Mailer,
             [
               adapter: Swoosh.Adapters.SMTP,
               relay: mail_relay,
               port: env_present.("MAIL_RELAY_PORT") || "587",
               username: env_present.("MAIL_RELAY_USERNAME"),
               password: env_present.("MAIL_RELAY_PASSWORD"),
               tls: :always,
               auth: :if_available,
               retries: 1,
               tls_options: [
                 verify: :verify_peer,
                 cacerts: :public_key.cacerts_get(),
                 server_name_indication: String.to_charlist(mail_relay),
                 customize_hostname_check: [
                   match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
                 ]
               ]
             ] ++ if(dkim, do: [dkim: dkim], else: [])

    true ->
      config :phemera,
             Phemera.Mailer,
             [
               adapter: Phemera.Mailer.DirectAdapter,
               hostname: env_present.("MAIL_HELO_DOMAIN") || auth_uri.host,
               port: 25,
               tls: :if_available,
               auth: :never,
               retries: 1,
               # Mail servers rarely present a certificate for their MX hostname,
               # so server-to-server TLS here encrypts without pinning identity.
               tls_options: [verify: :verify_none, versions: [:"tlsv1.2", :"tlsv1.3"]]
             ] ++ if(dkim, do: [dkim: dkim], else: [])
  end
end

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
