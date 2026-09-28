defmodule Phemera.Accounts.DeviceClaim do
  @moduledoc false
  use Ecto.Schema

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "device_claims" do
    belongs_to :user, Phemera.Auth.User, type: :binary_id
    belongs_to :target_device, Phemera.Accounts.Device
    belongs_to :requested_by_device, Phemera.Accounts.Device
    field :name, :string
    field :status, :string
    field :expires_at, :naive_datetime_usec
    timestamps(type: :naive_datetime_usec)
  end
end
