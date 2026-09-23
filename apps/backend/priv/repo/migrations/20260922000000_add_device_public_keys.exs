defmodule Anyshare.Repo.Migrations.AddDevicePublicKeys do
  use Ecto.Migration

  def change do
    alter table(:devices) do
      add :public_key, :text, null: true
    end
  end
end
