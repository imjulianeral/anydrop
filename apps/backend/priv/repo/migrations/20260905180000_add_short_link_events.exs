defmodule Anyshare.Repo.Migrations.AddShortLinkEvents do
  use Ecto.Migration

  def up do
    execute("""
    ALTER TABLE short_links
      ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0
    """)

    execute("""
    ALTER TABLE short_links
      ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0
    """)

    execute("""
    CREATE TABLE IF NOT EXISTS short_link_events (
      id varchar(36) PRIMARY KEY,
      code varchar(7) NOT NULL REFERENCES short_links(code) ON DELETE CASCADE,
      kind varchar NOT NULL,
      occurred_at timestamp(6) without time zone NOT NULL
    )
    """)

    execute("""
    CREATE INDEX IF NOT EXISTS index_short_link_events_on_code_and_occurred_at
    ON short_link_events (code, occurred_at)
    """)

    execute("""
    CREATE INDEX IF NOT EXISTS index_short_link_events_on_occurred_at
    ON short_link_events (occurred_at)
    """)
  end

  def down do
    execute("DROP TABLE IF EXISTS short_link_events")
    execute("ALTER TABLE short_links DROP COLUMN IF EXISTS view_count")
    execute("ALTER TABLE short_links DROP COLUMN IF EXISTS download_count")
  end
end
