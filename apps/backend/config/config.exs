import Config

config :phemera,
  ecto_repos: [Phemera.Repo],
  environment: config_env()

config :phemera, Phemera.Repo, migration_source: "ecto_schema_migrations"

config :phemera, PhemeraWeb.Endpoint,
  adapter: Bandit.PhoenixAdapter,
  http: [ip: {0, 0, 0, 0}],
  render_errors: [formats: [json: PhemeraWeb.ErrorJSON], layout: false],
  pubsub_server: Phemera.PubSub,
  secret_key_base: "development-secret-key-base-development-secret-key-base-1234567890"

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

# Mail goes through gen_smtp or stays local; no HTTP email API client is needed.
config :swoosh, :api_client, false
config :phemera, Phemera.Mailer, adapter: Swoosh.Adapters.Local

import_config "#{config_env()}.exs"
