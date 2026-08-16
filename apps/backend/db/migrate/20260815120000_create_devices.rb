class CreateDevices < ActiveRecord::Migration[8.1]
  def change
    create_table :devices, id: false do |t|
      t.string :id, null: false, primary_key: true, limit: 36
      t.string :display_name, null: false
      t.string :device_kind, null: false
      t.string :ip_hash, null: false
      t.string :room_code
      t.string :token_digest, null: false
      t.datetime :last_seen_at, null: false
      t.datetime :created_at, null: false
    end

    add_index :devices, :ip_hash
    add_index :devices, :room_code
    add_index :devices, :token_digest, unique: true
  end
end
