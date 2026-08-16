require "test_helper"

class DeviceTest < ActiveSupport::TestCase
  test "digest is sha256 hex" do
    assert_equal Digest::SHA256.hexdigest("secret"), Device.digest("secret")
  end

  test "authenticate finds by token digest" do
    token = Device.issue_token
    device = Device.create!(
      id: SecureRandom.uuid,
      display_name: "Amber Fox",
      device_kind: "desktop",
      ip_hash: "abc",
      token_digest: Device.digest(token),
      last_seen_at: Time.current,
      created_at: Time.current
    )

    assert_equal device.id, Device.authenticate(token).id
    assert_nil Device.authenticate("nope")
  end

  test "peers share ip hash or room code" do
    now = Time.current
    self_device = Device.create!(
      id: SecureRandom.uuid,
      display_name: "Self",
      device_kind: "desktop",
      ip_hash: "same",
      room_code: "ABC123",
      token_digest: Device.digest("a"),
      last_seen_at: now,
      created_at: now
    )
    nearby = Device.create!(
      id: SecureRandom.uuid,
      display_name: "Near",
      device_kind: "phone",
      ip_hash: "same",
      token_digest: Device.digest("b"),
      last_seen_at: now,
      created_at: now
    )
    roomed = Device.create!(
      id: SecureRandom.uuid,
      display_name: "Room",
      device_kind: "tablet",
      ip_hash: "other",
      room_code: "ABC123",
      token_digest: Device.digest("c"),
      last_seen_at: now,
      created_at: now
    )
    Device.create!(
      id: SecureRandom.uuid,
      display_name: "Away",
      device_kind: "desktop",
      ip_hash: "other",
      token_digest: Device.digest("d"),
      last_seen_at: now,
      created_at: now
    )

    peer_ids = Device.peers_for(self_device).pluck(:id)
    assert_includes peer_ids, nearby.id
    assert_includes peer_ids, roomed.id
    assert_equal 2, peer_ids.size
  end
end
