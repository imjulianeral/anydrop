defmodule Phemera.Auth.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "users" do
    field :email, :string
    field :name, :string
    field :plan, :string, default: "free"
    has_many :identities, Phemera.Auth.Identity
    has_many :passkeys, Phemera.Auth.Passkey
    timestamps(type: :utc_datetime_usec)
  end
end
