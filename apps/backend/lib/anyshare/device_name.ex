defmodule Anyshare.DeviceName do
  @moduledoc false

  @adjectives ~w(
    Amber Azure Bold Bright Calm Coral Cosmic Ember Fern Frost
    Golden Ivory Jade Lunar Moss Nova Olive Pearl Quiet Sage
    Silver Solar Swift Velvet
  )
  @animals ~w(
    Badger Crane Dove Finch Fox Hare Heron Ibis Jay Lynx
    Moose Otter Owl Puma Raven Seal Sparrow Tern Wolf Wren
  )

  @spec generate() :: String.t()
  def generate, do: "#{Enum.random(@adjectives)} #{Enum.random(@animals)}"
end
