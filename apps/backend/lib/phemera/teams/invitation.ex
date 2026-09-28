defmodule Phemera.Teams.Invitation do
  @moduledoc false
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id
  schema "team_invitations" do
    field :email, :string
    field :token_digest, :string, redact: true
    field :status, :string
    field :expires_at, :utc_datetime_usec
    belongs_to :team, Phemera.Teams.Team
    belongs_to :invited_by, Phemera.Auth.User
    belongs_to :accepted_by, Phemera.Auth.User
    timestamps(type: :utc_datetime_usec)
  end
end
