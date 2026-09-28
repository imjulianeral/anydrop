defmodule Phemera.Repo.Migrations.CreateDeviceGroups do
  use Ecto.Migration

  def change do
    create table(:device_groups, primary_key: false) do
      add :id, :string, primary_key: true, size: 36
      add :name, :string, null: false
      add :owner_id, references(:devices, type: :string, on_delete: :delete_all), null: false
      timestamps(type: :naive_datetime_usec)
    end

    create table(:group_members, primary_key: false) do
      add :group_id, references(:device_groups, type: :string, on_delete: :delete_all),
        primary_key: true

      add :device_id, references(:devices, type: :string, on_delete: :delete_all),
        primary_key: true
    end

    create index(:group_members, [:device_id])

    alter table(:transfers) do
      add :group_id, references(:device_groups, type: :string, on_delete: :nilify_all)
    end

    create index(:transfers, [:group_id, :created_at])
  end
end
