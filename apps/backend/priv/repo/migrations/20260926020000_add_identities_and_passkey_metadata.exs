defmodule Anyshare.Repo.Migrations.AddIdentitiesAndPasskeyMetadata do
  use Ecto.Migration

  def up do
    create table(:user_identities, primary_key: false) do
      add :id, :uuid, primary_key: true
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false
      add :provider, :text, null: false
      add :subject, :text, null: false
      add :email, :text
      timestamps(type: :utc_datetime_usec)
    end

    create unique_index(:user_identities, [:provider, :subject])
    create unique_index(:user_identities, [:user_id, :provider])

    execute """
    INSERT INTO user_identities (id, user_id, provider, subject, email, inserted_at, updated_at)
    SELECT gen_random_uuid(), id, 'google', google_sub, email, inserted_at, updated_at
    FROM users WHERE google_sub IS NOT NULL
    """

    drop index(:users, [:google_sub])

    alter table(:users) do
      remove :google_sub
    end

    alter table(:passkeys) do
      add :name, :text, null: false, default: "Passkey"
      add :aaguid, :uuid
      add :transports, {:array, :text}, null: false, default: []
      add :backed_up, :boolean, null: false, default: false
      add :last_used_at, :utc_datetime_usec
    end

    alter table(:auth_tokens) do
      add :authenticated_at, :utc_datetime_usec
    end
  end

  def down do
    alter table(:auth_tokens) do
      remove :authenticated_at
    end

    alter table(:passkeys) do
      remove :name
      remove :aaguid
      remove :transports
      remove :backed_up
      remove :last_used_at
    end

    alter table(:users) do
      add :google_sub, :text
    end

    execute """
    UPDATE users SET google_sub = i.subject
    FROM user_identities i WHERE i.user_id = users.id AND i.provider = 'google'
    """

    create unique_index(:users, [:google_sub])
    drop table(:user_identities)
  end
end
