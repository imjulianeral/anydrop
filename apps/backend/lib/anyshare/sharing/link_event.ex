defmodule Anyshare.Sharing.LinkEvent do
  @moduledoc false

  use Ecto.Schema
  import Ecto.Changeset

  @kinds ~w(view download)

  @primary_key {:id, :string, autogenerate: false}
  @foreign_key_type :string
  schema "short_link_events" do
    belongs_to :short_link, Anyshare.Sharing.ShortLink,
      foreign_key: :code,
      references: :code
    field :kind, :string
    field :occurred_at, :naive_datetime_usec
  end

  @type t :: %__MODULE__{
          id: String.t() | nil,
          code: String.t() | nil,
          kind: String.t() | nil,
          occurred_at: NaiveDateTime.t() | nil
        }

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(event, attrs) do
    event
    |> cast(attrs, [:id, :code, :kind, :occurred_at])
    |> validate_required([:id, :code, :kind, :occurred_at])
    |> validate_inclusion(:kind, @kinds)
    |> foreign_key_constraint(:code)
  end
end
