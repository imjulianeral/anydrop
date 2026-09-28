defmodule Phemera.Auth.Identity do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "user_identities" do
    belongs_to :user, Phemera.Auth.User, type: :binary_id
    field :provider, :string
    field :subject, :string
    field :email, :string
    field :picture, :string
    timestamps(type: :utc_datetime_usec)
  end
end
