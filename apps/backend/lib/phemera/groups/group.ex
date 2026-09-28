defmodule Phemera.Groups.Group do
  @moduledoc false
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "device_groups" do
    field :name, :string
    belongs_to :owner, Phemera.Accounts.Device

    many_to_many :members, Phemera.Accounts.Device,
      join_through: "group_members",
      join_keys: [group_id: :id, device_id: :id]

    timestamps(type: :naive_datetime_usec)
  end

  def changeset(group, attrs) do
    group
    |> cast(attrs, [:name])
    |> update_change(:name, &String.trim/1)
    |> validate_required([:name])
    |> validate_length(:name, max: 80)
  end
end
