defmodule Phemera.Sharing.Expiration do
  @moduledoc false

  import Ecto.Changeset

  @default_seconds 6 * 60 * 60
  @durations [3600, 21_600, 43_200, 86_400, 604_800]

  def default_seconds, do: @default_seconds

  def validate(changeset) do
    changeset =
      changeset
      |> validate_inclusion(:expires_in, @durations)
      |> validate_number(:max_downloads, greater_than: 0, less_than_or_equal_to: 100)

    seconds = get_change(changeset, :expires_in)
    created_at = get_field(changeset, :created_at)

    if seconds in @durations and created_at do
      put_change(changeset, :expires_at, NaiveDateTime.add(created_at, seconds))
    else
      changeset
    end
  end

  def live?(item) do
    NaiveDateTime.compare(item.expires_at, Phemera.Time.now()) == :gt and
      (is_nil(item.max_downloads) or count(item) < item.max_downloads)
  end

  defp count(%Phemera.Sharing.ShortLink{transfer_id: nil} = link), do: link.view_count
  defp count(item), do: item.download_count
end
