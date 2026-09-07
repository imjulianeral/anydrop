defmodule Anyshare.Sharing.ShortLink do
  @moduledoc false

  use Ecto.Schema
  import Ecto.Changeset

  @code ~r/^[A-Z0-9]{7}$/u
  @max_url_length 2048

  @primary_key {:code, :string, autogenerate: false}
  @foreign_key_type :string
  schema "short_links" do
    belongs_to :device, Anyshare.Accounts.Device
    belongs_to :transfer, Anyshare.Sharing.Transfer
    has_many :events, Anyshare.Sharing.LinkEvent, foreign_key: :code, references: :code
    field :target_url, :string
    field :view_count, :integer, default: 0
    field :download_count, :integer, default: 0
    field :expires_at, :naive_datetime_usec
    field :created_at, :naive_datetime_usec
  end

  @type t :: %__MODULE__{
          code: String.t() | nil,
          device_id: String.t() | nil,
          transfer_id: String.t() | nil,
          target_url: String.t() | nil,
          view_count: integer(),
          download_count: integer(),
          expires_at: NaiveDateTime.t() | nil,
          created_at: NaiveDateTime.t() | nil
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(link, attrs) do
    link
    |> cast(attrs, [:code, :device_id, :transfer_id, :target_url, :expires_at, :created_at])
    |> validate_required([:code, :expires_at, :created_at])
    |> validate_format(:code, @code)
    |> validate_length(:target_url, max: @max_url_length)
    |> validate_destination()
    |> unique_constraint(:code, name: :short_links_pkey)
    |> foreign_key_constraint(:device_id)
    |> foreign_key_constraint(:transfer_id)
  end

  defp validate_destination(changeset) do
    target_url = get_field(changeset, :target_url)
    transfer_id = get_field(changeset, :transfer_id)

    cond do
      is_binary(transfer_id) ->
        changeset

      not is_binary(target_url) or target_url == "" ->
        add_error(changeset, :target_url, "can't be blank")

      valid_http_url?(target_url) ->
        changeset

      true ->
        add_error(changeset, :target_url, "must be an http or https URL")
    end
  end

  defp valid_http_url?(target_url) do
    case URI.parse(target_url) do
      %URI{scheme: scheme, host: host}
      when scheme in ["http", "https"] and is_binary(host) and host != "" ->
        true

      _other ->
        false
    end
  end
end
