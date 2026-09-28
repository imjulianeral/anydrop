defmodule Phemera.Repo.Migrations.AllowPasskeyOnlyUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      modify :google_sub, :text, null: true, from: {:text, null: false}
      modify :email, :text, null: true, from: {:text, null: false}
    end
  end
end
