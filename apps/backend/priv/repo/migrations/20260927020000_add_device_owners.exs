defmodule Phemera.Repo.Migrations.AddDeviceOwners do
  use Ecto.Migration

  def change do
    alter table(:devices) do
      add :user_id, references(:users, type: :uuid, on_delete: :nilify_all)
      add :saved_at, :naive_datetime_usec
    end

    create index(:devices, [:user_id])

    create table(:device_claims, primary_key: false) do
      add :id, :string, primary_key: true, size: 36
      add :user_id, references(:users, type: :uuid, on_delete: :delete_all), null: false

      add :target_device_id, references(:devices, type: :string, on_delete: :delete_all),
        null: false

      add :requested_by_device_id, references(:devices, type: :string, on_delete: :nilify_all)
      add :name, :string, null: false
      add :status, :string, null: false
      add :expires_at, :naive_datetime_usec, null: false
      timestamps(type: :naive_datetime_usec)
    end

    create unique_index(:device_claims, [:target_device_id],
             where: "status = 'pending'",
             name: :device_claims_pending_target_index
           )

    create index(:device_claims, [:user_id, :inserted_at])
  end
end
