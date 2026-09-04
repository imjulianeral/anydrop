defmodule Anyshare.Sharing.Transfer do
  @moduledoc false

  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(file text)
  @statuses ~w(pending uploaded delivered expired failed)
  @max_file_bytes 2 * 1024 * 1024 * 1024
  @max_text_length 64 * 1024

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "transfers" do
    belongs_to :sender, Anyshare.Accounts.Device
    belongs_to :recipient, Anyshare.Accounts.Device
    field :kind, :string
    field :filename, :string
    field :byte_size, :integer
    field :content_type, :string
    field :body, :string
    field :r2_key, :string
    field :status, :string
    field :expires_at, :naive_datetime_usec
    field :created_at, :naive_datetime_usec

    has_many :short_links, Anyshare.Sharing.ShortLink
  end

  @type t :: %__MODULE__{
          id: String.t() | nil,
          sender_id: String.t() | nil,
          recipient_id: String.t() | nil,
          kind: String.t() | nil,
          filename: String.t() | nil,
          byte_size: integer() | nil,
          content_type: String.t() | nil,
          body: String.t() | nil,
          r2_key: String.t() | nil,
          status: String.t() | nil,
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
      :kind,
      :filename,
      :byte_size,
      :content_type,
      :body,
      :r2_key,
      :status,
      :expires_at,
      :created_at
    ])
    |> validate_required([:id, :sender_id, :kind, :status, :expires_at, :created_at])
    |> validate_inclusion(:kind, @kinds)
    |> validate_inclusion(:status, @statuses)
    |> validate_kind()
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
        changeset
        |> validate_required([:body])
        |> validate_length(:body, max: @max_text_length)

      _other ->
        changeset
    end
  end
end
