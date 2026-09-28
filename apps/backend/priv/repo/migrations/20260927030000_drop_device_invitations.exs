defmodule Phemera.Repo.Migrations.DropDeviceInvitations do
  use Ecto.Migration

  def up do
    drop table(:device_invitations)
  end

  def down do
    create table(:device_invitations, primary_key: false) do
      add :id, :string, primary_key: true, size: 36
      add :sender_id, references(:devices, type: :string), null: false
      add :recipient_id, references(:devices, type: :string), null: false
      add :status, :string, null: false
      add :expires_at, :naive_datetime_usec, null: false
      timestamps(type: :naive_datetime_usec)
    end

    create unique_index(
             :device_invitations,
             [
               "LEAST(sender_id, recipient_id)",
               "GREATEST(sender_id, recipient_id)"
             ],
             name: :device_invitations_pair_index
           )

    create index(:device_invitations, [:sender_id, :status])
    create index(:device_invitations, [:recipient_id, :status])
  end
end
