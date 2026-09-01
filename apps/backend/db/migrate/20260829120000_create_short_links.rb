class CreateShortLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :short_links, id: false do |t|
      t.string :code, null: false, primary_key: true, limit: 7
      t.string :device_id, limit: 36
      t.text :target_url, null: false
      t.datetime :expires_at, null: false
      t.datetime :created_at, null: false
    end

    add_index :short_links, :expires_at
    add_index :short_links, :device_id
    add_foreign_key :short_links, :devices
  end
end
