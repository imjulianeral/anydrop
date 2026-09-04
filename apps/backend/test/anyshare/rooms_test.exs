defmodule Anyshare.RoomsTest do
  use ExUnit.Case, async: true

  alias Anyshare.Rooms

  test "IP hashes are stable" do
    assert Rooms.ip_hash("1.2.3.4") == Rooms.ip_hash("1.2.3.4")
    refute Rooms.ip_hash("1.2.3.4") == Rooms.ip_hash("1.2.3.5")
  end

  test "room codes are normalized" do
    assert Rooms.normalize_code("abc-123") == "ABC123"
    assert Rooms.normalize_code("   ") == nil
  end

  test "generated room codes are six alphanumeric characters" do
    assert Rooms.generate_code() =~ ~r/^[A-Z0-9]{6}$/u
  end
end
