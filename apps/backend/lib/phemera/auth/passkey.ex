defmodule Phemera.Auth.Passkey do
  use Ecto.Schema

  @primary_key {:id, :string, autogenerate: false}
  schema "passkeys" do
    belongs_to :user, Phemera.Auth.User, type: :binary_id
    field :name, :string, default: "Passkey"
    field :aaguid, Ecto.UUID
    field :transports, {:array, :string}, default: []
    field :backed_up, :boolean, default: false
    field :public_key, :binary
    field :sign_count, :integer, default: 0
    field :last_used_at, :utc_datetime_usec
    timestamps(type: :utc_datetime_usec)
  end
end
