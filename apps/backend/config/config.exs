import Config

config :anyshare,
  ecto_repos: [Anyshare.Repo],
  environment: config_env()

config :anyshare, Anyshare.Repo, migration_source: "ecto_schema_migrations"

config :anyshare, AnyshareWeb.Endpoint,
  adapter: Bandit.PhoenixAdapter,
  http: [ip: {0, 0, 0, 0}],
  render_errors: [formats: [json: AnyshareWeb.ErrorJSON], layout: false],
  pubsub_server: Anyshare.PubSub,
  secret_key_base: "development-secret-key-base-development-secret-key-base-1234567890"

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
