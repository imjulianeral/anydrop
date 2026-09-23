defmodule Anyshare.Repo.Migrations.AddItemExpirationLimits do
  use Ecto.Migration

  def change do
    alter table(:transfers) do
      add :max_downloads, :integer
      add :download_count, :integer, null: false, default: 0
    end

    alter table(:short_links) do
      add :max_downloads, :integer
    end

    create constraint(:transfers, :transfers_max_downloads_positive,
             check: "max_downloads IS NULL OR max_downloads BETWEEN 1 AND 100"
           )

    create constraint(:short_links, :short_links_max_downloads_positive,
             check: "max_downloads IS NULL OR max_downloads BETWEEN 1 AND 100"
           )
  end
end
