defmodule Anyshare.Repo.Migrations.AddTransferSecrets do
  use Ecto.Migration

  def change do
    alter table(:transfers) do
      add :secret, :map
    end
  end
end
