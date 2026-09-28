defmodule Phemera.Repo.Migrations.AddIdentityPictures do
  use Ecto.Migration

  def change do
    alter table(:user_identities) do
      add :picture, :text
    end
  end
end
