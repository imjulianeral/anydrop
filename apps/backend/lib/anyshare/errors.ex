defmodule Anyshare.Errors do
  @moduledoc false

  @spec message(Ecto.Changeset.t()) :: String.t()
  def message(changeset) do
    changeset
    |> Ecto.Changeset.traverse_errors(fn {message, options} ->
      Enum.reduce(options, message, fn {key, value}, rendered ->
        String.replace(rendered, "%{#{key}}", to_string(value))
      end)
    end)
    |> Enum.flat_map(fn {field, messages} ->
      Enum.map(messages, fn message -> "#{field} #{message}" end)
    end)
    |> Enum.join(", ")
  end
end
