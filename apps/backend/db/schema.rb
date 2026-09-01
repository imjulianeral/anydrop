# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_29_120001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "devices", id: { type: :string, limit: 36 }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "device_kind", null: false
    t.string "display_name", null: false
    t.string "ip_hash", null: false
    t.datetime "last_seen_at", null: false
    t.string "room_code"
    t.string "token_digest", null: false
    t.index ["ip_hash"], name: "index_devices_on_ip_hash"
    t.index ["room_code"], name: "index_devices_on_room_code"
    t.index ["token_digest"], name: "index_devices_on_token_digest", unique: true
  end

  create_table "transfers", id: { type: :string, limit: 36 }, force: :cascade do |t|
    t.text "body"
    t.bigint "byte_size"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "filename"
    t.string "kind", null: false
    t.string "r2_key"
    t.string "recipient_id", limit: 36
    t.string "sender_id", limit: 36, null: false
    t.string "status", null: false
    t.index ["expires_at"], name: "index_transfers_on_expires_at"
    t.index ["recipient_id", "status"], name: "index_transfers_on_recipient_id_and_status"
    t.index ["sender_id"], name: "index_transfers_on_sender_id"
  end

  create_table "short_links", primary_key: "code", id: { type: :string, limit: 7 }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "device_id", limit: 36
    t.datetime "expires_at", null: false
    t.text "target_url"
    t.string "transfer_id", limit: 36
    t.index ["device_id"], name: "index_short_links_on_device_id"
    t.index ["expires_at"], name: "index_short_links_on_expires_at"
    t.index ["transfer_id"], name: "index_short_links_on_transfer_id"
  end

  add_foreign_key "short_links", "devices"
  add_foreign_key "short_links", "transfers"
  add_foreign_key "transfers", "devices", column: "recipient_id"
  add_foreign_key "transfers", "devices", column: "sender_id"
end
