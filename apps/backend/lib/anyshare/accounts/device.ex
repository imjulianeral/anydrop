defmodule Anyshare.Accounts.Device do
  @moduledoc false

  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(phone tablet desktop)
  @room_code ~r/^[A-Z0-9]{6}$/u

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "devices" do
    field :display_name, :string
    field :device_kind, :string
    field :ip_hash, :string
    field :room_code, :string
    field :token_digest, :string
    field :last_seen_at, :naive_datetime_usec
    field :created_at, :naive_datetime_usec

    has_many :sent_transfers, Anyshare.Sharing.Transfer, foreign_key: :sender_id
    has_many :received_transfers, Anyshare.Sharing.Transfer, foreign_key: :recipient_id
    has_many :short_links, Anyshare.Sharing.ShortLink
  end

  @type t :: %__MODULE__{
          id: String.t() | nil,
          display_name: String.t() | nil,
          device_kind: String.t() | nil,
          ip_hash: String.t() | nil,
          room_code: String.t() | nil,
          token_digest: String.t() | nil,
          last_seen_at: NaiveDateTime.t() | nil,
          created_at: NaiveDateTime.t() | nil
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(device, attrs) do
    device
    |> cast(attrs, [
      :id,
      :display_name,
      :device_kind,
      :ip_hash,
      :room_code,
      :token_digest,
      :last_seen_at,
      :created_at
    ])
    |> validate_required([
      :id,
      :display_name,
      :device_kind,
      :ip_hash,
      :token_digest,
      :last_seen_at,
      :created_at
    ])
    |> validate_length(:display_name, max: 40)
    |> validate_inclusion(:device_kind, @kinds)
    |> validate_format(:room_code, @room_code)
    |> unique_constraint(:token_digest, name: :index_devices_on_token_digest)
  end
end
