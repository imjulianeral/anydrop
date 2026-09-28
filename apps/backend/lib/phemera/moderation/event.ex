defmodule Phemera.Moderation.Event do
  @moduledoc false

  use Ecto.Schema

  @foreign_key_type :string
  schema "moderation_events" do
    field :action, :string
    belongs_to :transfer, Phemera.Sharing.Transfer
    belongs_to :device, Phemera.Accounts.Device
    field :signal_type, :string
    field :digest, :binary
    field :target_url, :string
    field :category, :string
    field :source, :string
    field :created_at, :naive_datetime
  end

  @type t :: %__MODULE__{}
end
