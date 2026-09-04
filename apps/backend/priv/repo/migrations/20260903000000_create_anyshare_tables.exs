defmodule Anyshare.Repo.Migrations.CreateAnyshareTables do
  use Ecto.Migration

  def up do
    execute("""
    CREATE TABLE IF NOT EXISTS devices (
      id varchar(36) PRIMARY KEY,
      display_name varchar NOT NULL,
      device_kind varchar NOT NULL,
      ip_hash varchar NOT NULL,
      room_code varchar,
      token_digest varchar NOT NULL,
      last_seen_at timestamp(6) without time zone NOT NULL,
      created_at timestamp(6) without time zone NOT NULL
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS index_devices_on_ip_hash ON devices (ip_hash)")
    execute("CREATE INDEX IF NOT EXISTS index_devices_on_room_code ON devices (room_code)")

    execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS index_devices_on_token_digest ON devices (token_digest)"
    )

    execute("""
    CREATE TABLE IF NOT EXISTS transfers (
      id varchar(36) PRIMARY KEY,
      sender_id varchar(36) NOT NULL REFERENCES devices(id),
      recipient_id varchar(36) REFERENCES devices(id),
      kind varchar NOT NULL,
      filename varchar,
      byte_size bigint,
      content_type varchar,
      body text,
      r2_key varchar,
      status varchar NOT NULL,
      expires_at timestamp(6) without time zone NOT NULL,
      created_at timestamp(6) without time zone NOT NULL
    )
    """)

    execute("CREATE INDEX IF NOT EXISTS index_transfers_on_sender_id ON transfers (sender_id)")

    execute("""
    CREATE INDEX IF NOT EXISTS index_transfers_on_recipient_id_and_status
    ON transfers (recipient_id, status)
    """)

    execute("CREATE INDEX IF NOT EXISTS index_transfers_on_expires_at ON transfers (expires_at)")

    execute("""
    CREATE TABLE IF NOT EXISTS short_links (
      code varchar(7) PRIMARY KEY,
      device_id varchar(36) REFERENCES devices(id),
      target_url text,
      expires_at timestamp(6) without time zone NOT NULL,
      created_at timestamp(6) without time zone NOT NULL,
      transfer_id varchar(36) REFERENCES transfers(id)
    )
    """)

    execute(
      "CREATE INDEX IF NOT EXISTS index_short_links_on_expires_at ON short_links (expires_at)"
    )

    execute(
      "CREATE INDEX IF NOT EXISTS index_short_links_on_device_id ON short_links (device_id)"
    )

    execute(
      "CREATE INDEX IF NOT EXISTS index_short_links_on_transfer_id ON short_links (transfer_id)"
    )
  end

  def down do
    :ok
  end
end
