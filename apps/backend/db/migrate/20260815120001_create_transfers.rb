class CreateTransfers < ActiveRecord::Migration[8.1]
  def change
    create_table :transfers, id: false do |t|
      t.string :id, null: false, primary_key: true, limit: 36
      t.string :sender_id, null: false, limit: 36
      t.string :recipient_id, null: false, limit: 36
      t.string :kind, null: false
      t.string :filename
      t.bigint :byte_size
      t.string :content_type
      t.text :body
      t.string :r2_key
      t.string :status, null: false
      t.datetime :expires_at, null: false
      t.datetime :created_at, null: false
    end

    add_foreign_key :transfers, :devices, column: :sender_id
    add_foreign_key :transfers, :devices, column: :recipient_id
    add_index :transfers, :sender_id
    add_index :transfers, [ :recipient_id, :status ]
    add_index :transfers, :expires_at
  end
end
