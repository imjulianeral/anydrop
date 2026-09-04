import Config

config :anyshare, Anyshare.Repo,
  url:
    System.get_env("TEST_DATABASE_URL") || System.get_env("DATABASE_URL") ||
      "postgresql://postgres:postgres@localhost:51214/anyshare_test",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :anyshare, AnyshareWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "test-secret-key-base-test-secret-key-base-test-secret-key-base-1234",
  server: false

config :logger, level: :warning
config :phoenix, :plug_init_mode, :runtime
