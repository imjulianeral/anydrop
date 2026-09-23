defmodule Anyshare.Repo.Migrations.AddShortLinkPasswords do
  use Ecto.Migration

  def change do
    alter table(:short_links) do
      add :password_verifier, :text
    end
  end
end
