defmodule Anyshare.Sharing.LinkPasswordTest do
  use ExUnit.Case, async: true

  alias Anyshare.Sharing.LinkPassword

  @password "four random words"

  test "accepts a matching password and rejects everything else" do
    verifier = LinkPassword.hash(@password)

    assert LinkPassword.verify(@password, verifier)
    refute LinkPassword.verify("four random words!", verifier)
    refute LinkPassword.verify(@password, "pbkdf2-sha256$1$aa$bb")
    refute verifier =~ @password
  end

  test "requires 12 to 1024 characters" do
    assert LinkPassword.valid?(@password)
    refute LinkPassword.valid?("too short")
    refute LinkPassword.valid?(String.duplicate("a", 1025))
    refute LinkPassword.valid?(nil)
  end
end
