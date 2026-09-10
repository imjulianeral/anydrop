defmodule Anyshare.Repo.Migrations.UtcShortLinkEventTimes do
  use Ecto.Migration

  def up do
    execute("""
    ALTER TABLE short_link_events
      ALTER COLUMN occurred_at TYPE timestamp(6) with time zone
      USING occurred_at AT TIME ZONE 'UTC'
    """)
  end

  def down do
    execute("""
    ALTER TABLE short_link_events
      ALTER COLUMN occurred_at TYPE timestamp(6) without time zone
      USING occurred_at AT TIME ZONE 'UTC'
    """)
  end
end
