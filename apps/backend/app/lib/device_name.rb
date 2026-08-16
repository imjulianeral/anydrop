module DeviceName
  ADJECTIVES = %w[
    Amber Azure Bold Bright Calm Coral Cosmic Ember Fern Frost
    Golden Ivory Jade Lunar Moss Nova Olive Pearl Quiet Sage
    Silver Solar Swift Velvet
  ].freeze

  ANIMALS = %w[
    Badger Crane Dove Finch Fox Hare Heron Ibis Jay Lynx
    Moose Otter Owl Puma Raven Seal Sparrow Tern Wolf Wren
  ].freeze

  module_function

  def generate
    "#{ADJECTIVES.sample} #{ANIMALS.sample}"
  end
end
