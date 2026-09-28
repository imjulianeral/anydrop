defmodule Phemera.Teams.Member do
  @moduledoc false
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id
  schema "team_members" do
    belongs_to :team, Phemera.Teams.Team, primary_key: true
    belongs_to :user, Phemera.Auth.User, primary_key: true
    field :role, :string
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
