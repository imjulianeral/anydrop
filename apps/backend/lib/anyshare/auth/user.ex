defmodule Anyshare.Auth.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "users" do
    field :email, :string
    field :name, :string
    has_many :identities, Anyshare.Auth.Identity
    has_many :passkeys, Anyshare.Auth.Passkey
    timestamps(type: :utc_datetime_usec)
  end
end
