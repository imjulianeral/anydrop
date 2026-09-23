defmodule Anyshare.Accounts.Invitation do
  @moduledoc false
  use Ecto.Schema

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "device_invitations" do
    belongs_to :sender, Anyshare.Accounts.Device
    belongs_to :recipient, Anyshare.Accounts.Device
    field :status, :string
    field :expires_at, :naive_datetime_usec
    timestamps(type: :naive_datetime_usec)
  end
end
