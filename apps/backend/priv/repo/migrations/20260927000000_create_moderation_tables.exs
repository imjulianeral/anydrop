defmodule Phemera.Repo.Migrations.CreateModerationTables do
  use Ecto.Migration

  def change do
    create table(:hash_signals) do
      add :signal_type, :string, null: false
      add :digest, :binary, null: false
      # PDQ rows repeat the digest as bit(256) so matching can use bit_count.
      add :pdq, :"bit(256)"
      add :category, :string, null: false
      add :source, :string, null: false
      add :imported_at, :naive_datetime_usec, null: false
    end

    create unique_index(:hash_signals, [:signal_type, :digest])

    create constraint(:hash_signals, :hash_signals_signal_type,
             check: "signal_type IN ('md5', 'sha256', 'pdq')"
           )

    create table(:moderation_events) do
      add :action, :string, null: false
      add :transfer_id, references(:transfers, type: :string, on_delete: :nilify_all)
      add :device_id, references(:devices, type: :string, on_delete: :nilify_all)
      add :signal_type, :string
      add :digest, :binary
      add :target_url, :text
      add :category, :string
      add :source, :string
      add :created_at, :naive_datetime_usec, null: false
    end

    create index(:moderation_events, [:device_id, :created_at])
  end
end
