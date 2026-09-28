defmodule Phemera.Auth.Token do
  use Ecto.Schema

  @primary_key {:id, :string, autogenerate: false}
  schema "auth_tokens" do
    field :kind, :string
    belongs_to :user, Phemera.Auth.User, type: :binary_id
    field :data, :binary
    field :expires_at, :utc_datetime_usec
    field :authenticated_at, :utc_datetime_usec
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
