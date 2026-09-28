defmodule Phemera.Repo.Migrations.CreateAuthTables do
  use Ecto.Migration

  def change do
    create table(:users, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :google_sub, :text, null: false
      add :email, :text, null: false
      add :name, :text, null: false
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:users, [:google_sub])

    create table(:passkeys, primary_key: false) do
      add :id, :text, primary_key: true
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :public_key, :binary, null: false
      add :sign_count, :bigint, null: false, default: 0
      timestamps(type: :utc_datetime_usec)
    end

    create index(:passkeys, [:user_id])

    create table(:auth_tokens, primary_key: false) do
      add :id, :string, primary_key: true
      add :kind, :string, null: false
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all)
      add :data, :binary
      add :expires_at, :utc_datetime_usec, null: false
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:auth_tokens, [:expires_at])
    create index(:auth_tokens, [:user_id])
  end
end
