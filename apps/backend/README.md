# AnyShare backend

Phoenix/Elixir JSON API for device discovery, room presence, text and file
transfers, and short links. It keeps the Rails-era HTTP, database, and Action
Cable WebSocket contracts so the existing web app and PostgreSQL data continue
to work without a coordinated cutover.

## Development

Elixir 1.18 or newer and PostgreSQL 18.6 are required. Local development uses
`postgres:18.6-alpine` on `postgresql://postgres:postgres@localhost:51214/postgres`.

```sh
mix setup
mix phx.server
```

Set `DATABASE_URL` to use another database. The app reads the other supported
settings from `.env.example` when they are exported into the environment.

## Checks

```sh
mix format --check-formatted
mix compile --warnings-as-errors
mix test
```

## Database compatibility

Ecto records its versions in `ecto_schema_migrations`. The compatibility
migration creates the existing `devices`, `transfers`, and `short_links` tables
only when they do not already exist; it does not change or delete Rails-created
tables.
