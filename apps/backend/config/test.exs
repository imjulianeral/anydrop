import Config

config :phemera, Phemera.Repo,
  url:
    System.get_env("TEST_DATABASE_URL") || System.get_env("DATABASE_URL") ||
      "postgresql://postgres:postgres@localhost:51214/phemera_test",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :phemera, PhemeraWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "test-secret-key-base-test-secret-key-base-test-secret-key-base-1234",
  server: false

config :logger, level: :warning
config :phoenix, :plug_init_mode, :runtime

config :phemera, Phemera.Mailer, adapter: Swoosh.Adapters.Test
config :phemera, mailer_async: false
config :swoosh, :local, false
