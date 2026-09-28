defmodule Phemera.Teams.Team do
  @moduledoc false
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "teams" do
    field :name, :string
    belongs_to :owner, Phemera.Auth.User
    has_many :members, Phemera.Teams.Member
    has_many :invitations, Phemera.Teams.Invitation
    timestamps(type: :utc_datetime_usec)
  end
end
