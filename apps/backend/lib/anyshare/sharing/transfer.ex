defmodule Anyshare.Sharing.Transfer do
  @moduledoc false

  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(file text)
  @statuses ~w(pending uploaded delivered expired failed)
  # R2's documented 5 TiB object limit excludes 5 GiB.
  @max_file_bytes 5 * 1024 * 1024 * 1024 * 1024 - 5 * 1024 * 1024 * 1024
  @max_text_length 64 * 1024

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "transfers" do
    belongs_to :sender, Anyshare.Accounts.Device
    belongs_to :recipient, Anyshare.Accounts.Device
    belongs_to :group, Anyshare.Groups.Group
    field :kind, :string
    field :filename, :string
    field :byte_size, :integer
    field :content_type, :string
    field :body, :string
    field :secret, :map
    field :r2_key, :string
    field :upload_id, :string
    field :upload_part_size, :integer
    field :status, :string
    field :expires_in, :integer, virtual: true
    field :max_downloads, :integer
    field :download_count, :integer, default: 0
    field :expires_at, :naive_datetime_usec
    field :created_at, :naive_datetime_usec

    has_many :short_links, Anyshare.Sharing.ShortLink
  end

  @type t :: %__MODULE__{
          id: String.t() | nil,
          sender_id: String.t() | nil,
          recipient_id: String.t() | nil,
          group_id: String.t() | nil,
          kind: String.t() | nil,
          filename: String.t() | nil,
          byte_size: integer() | nil,
          content_type: String.t() | nil,
          body: String.t() | nil,
          secret: map() | nil,
          r2_key: String.t() | nil,
          upload_id: String.t() | nil,
          upload_part_size: integer() | nil,
          status: String.t() | nil,
          max_downloads: integer() | nil,
          download_count: integer(),
          expires_at: NaiveDateTime.t() | nil,
          created_at: NaiveDateTime.t() | nil
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(transfer, attrs) do
    transfer
    |> cast(attrs, [
      :id,
      :sender_id,
      :recipient_id,
      :group_id,
      :kind,
      :filename,
      :byte_size,
      :content_type,
      :body,
      :secret,
      :r2_key,
      :upload_id,
      :upload_part_size,
      :status,
      :expires_in,
      :max_downloads,
      :expires_at,
      :created_at
    ])
    |> Anyshare.Sharing.Expiration.validate()
    |> validate_required([:id, :sender_id, :kind, :status, :expires_at, :created_at])
    |> validate_inclusion(:kind, @kinds)
    |> validate_inclusion(:status, @statuses)
    |> validate_kind()
    |> Anyshare.Sharing.Secret.validate()
    |> foreign_key_constraint(:sender_id)
    |> foreign_key_constraint(:recipient_id)
  end

  defp validate_kind(changeset) do
    case get_field(changeset, :kind) do
      "file" ->
        changeset
        |> validate_required([:filename, :byte_size])
        |> validate_number(:byte_size, greater_than: 0, less_than_or_equal_to: @max_file_bytes)

      "text" ->
        max_length = if get_field(changeset, :secret), do: 87_404, else: @max_text_length

        changeset
        |> validate_required([:body])
        |> validate_length(:body, max: max_length)

      _other ->
        changeset
    end
  end
end
