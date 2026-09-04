defmodule Anyshare.Time do
  @moduledoc false

  @spec now() :: NaiveDateTime.t()
  def now do
    DateTime.utc_now()
    |> DateTime.to_naive()
    |> NaiveDateTime.truncate(:second)
  end

  @spec iso8601(NaiveDateTime.t() | DateTime.t()) :: String.t()
  def iso8601(%NaiveDateTime{} = datetime), do: NaiveDateTime.to_iso8601(datetime) <> "Z"
  def iso8601(%DateTime{} = datetime), do: DateTime.to_iso8601(datetime)
end
