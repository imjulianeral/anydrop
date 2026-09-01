class MakeTransfersLinkable < ActiveRecord::Migration[8.1]
  def change
    change_column_null :transfers, :recipient_id, true
    change_column_null :short_links, :target_url, true
    add_column :short_links, :transfer_id, :string, limit: 36
    add_index :short_links, :transfer_id
    add_foreign_key :short_links, :transfers
  end
end
