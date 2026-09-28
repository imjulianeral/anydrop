import Config

config :phemera, Phemera.Repo,
  url:
    System.get_env("DATABASE_URL") ||
      "postgresql://postgres:postgres@localhost:51214/postgres",
  pool_size: 10,
  show_sensitive_data_on_connection_error: true,
  stacktrace: true

config :phemera, PhemeraWeb.Endpoint,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "development-secret-key-base-development-secret-key-base-1234567890",
  watchers: []

config :logger, :console, format: "[$level] $message\n"
config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime

# Invitation emails appear at http://localhost:4000/dev/mailbox.
config :phemera, dev_routes: true
