defmodule Phemera.Repo.Migrations.CreateUsageDaily do
  use Ecto.Migration

  def up do
    # Daily counters that outlive the links they describe: counts only, no
    # content, names or URLs.
    create table(:usage_daily, primary_key: false) do
      add :device_id, references(:devices, type: :string, on_delete: :delete_all),
        primary_key: true

      add :day, :date, primary_key: true
      add :kind, :string, primary_key: true
      add :metric, :string, primary_key: true
      add :count, :bigint, null: false, default: 0
      add :bytes, :bigint, null: false, default: 0
    end

    create index(:usage_daily, [:day])

    flush()

    # Keep the history of links that are still live today.
    execute("""
    INSERT INTO usage_daily (device_id, day, kind, metric, count)
    SELECT link.device_id,
           event.occurred_at::date,
           CASE WHEN link.target_url IS NOT NULL THEN 'url' ELSE transfer.kind END,
           event.kind,
           count(*)
    FROM short_link_events AS event
    JOIN short_links AS link ON link.code = event.code
    LEFT JOIN transfers AS transfer ON transfer.id = link.transfer_id
    WHERE link.device_id IS NOT NULL
      AND (link.target_url IS NOT NULL OR transfer.kind IS NOT NULL)
    GROUP BY 1, 2, 3, 4
    """)

    execute("""
    INSERT INTO usage_daily (device_id, day, kind, metric, count)
    SELECT link.device_id,
           link.created_at::date,
           CASE WHEN link.target_url IS NOT NULL THEN 'url' ELSE transfer.kind END,
           'created',
           count(*)
    FROM short_links AS link
    LEFT JOIN transfers AS transfer ON transfer.id = link.transfer_id
    WHERE link.device_id IS NOT NULL
      AND (link.target_url IS NOT NULL OR transfer.kind IS NOT NULL)
    GROUP BY 1, 2, 3, 4
    """)
  end

  def down do
    drop table(:usage_daily)
  end
end
