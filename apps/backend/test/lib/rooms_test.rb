require "test_helper"

class RoomsTest < ActiveSupport::TestCase
  test "ip hash is stable" do
    assert_equal Rooms.ip_hash("1.2.3.4"), Rooms.ip_hash("1.2.3.4")
    refute_equal Rooms.ip_hash("1.2.3.4"), Rooms.ip_hash("1.2.3.5")
  end

  test "normalize room codes" do
    assert_equal "ABC123", Rooms.normalize_code("abc-123")
    assert_nil Rooms.normalize_code("   ")
  end

  test "generated codes are six alphanumeric" do
    assert_match(/\A[A-Z0-9]{6}\z/, Rooms.generate_code)
  end
end
