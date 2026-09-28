defmodule Phemera.Repo.Migrations.CreateTeams do
  use Ecto.Migration

  def change do
    alter table(:users) do
      add :plan, :string, null: false, default: "free"
    end

    create table(:teams, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :name, :string, null: false
      add :owner_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:teams, [:owner_id])

    create table(:team_members, primary_key: false) do
      add :team_id, references(:teams, type: :uuid, on_delete: :delete_all), primary_key: true

      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), primary_key: true

      add :role, :string, null: false
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    # One team per person keeps "my team" unambiguous in the app.
    create unique_index(:team_members, [:user_id])

    create table(:team_invitations, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :team_id, references(:teams, type: :uuid, on_delete: :delete_all), null: false
      add :email, :string, null: false
      add :token_digest, :string, null: false

      add :invited_by_id, references(:users, type: :uuid, on_delete: :nilify_all)

      add :accepted_by_id, references(:users, type: :uuid, on_delete: :nilify_all)
      add :status, :string, null: false
      add :expires_at, :utc_datetime_usec, null: false
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:team_invitations, [:token_digest])
    create index(:team_invitations, [:team_id, :status])
    create index(:team_invitations, [:invited_by_id, :inserted_at])
  end
end
