defmodule Phemera.Repo.Migrations.PreserveGroupTransferIds do
  use Ecto.Migration

  def up do
    execute("ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_group_id_fkey")
  end

  def down do
    execute("""
    UPDATE transfers AS transfer
    SET group_id = NULL
    WHERE group_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM device_groups AS group_row WHERE group_row.id = transfer.group_id
      )
    """)

    execute("""
    ALTER TABLE transfers
    ADD CONSTRAINT transfers_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES device_groups(id) ON DELETE SET NULL
    """)
  end
end
