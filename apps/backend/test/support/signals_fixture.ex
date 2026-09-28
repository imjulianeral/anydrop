defmodule Phemera.SignalsFixture do
  @moduledoc false

  @doc "Upload signals as the browser sends them, for a file no list contains."
  def signals(overrides \\ %{}) do
    Map.merge(
      %{
        "md5" => Base.encode16(:crypto.strong_rand_bytes(16), case: :lower),
        "sha256" => Base.encode16(:crypto.strong_rand_bytes(32), case: :lower)
      },
      overrides
    )
  end
end
