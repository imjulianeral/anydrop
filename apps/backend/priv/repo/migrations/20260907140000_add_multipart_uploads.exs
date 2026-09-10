defmodule Anyshare.Repo.Migrations.AddMultipartUploads do
  use Ecto.Migration

  def change do
    alter table(:transfers) do
      add :upload_id, :text
      add :upload_part_size, :integer
    end
  end
end
