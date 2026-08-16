class RoomChannel < ApplicationCable::Channel
  def subscribed
    stream_from ip_stream
    stream_from code_stream if current_device.room_code.present?
    broadcast_to_rooms("peer_joined", current_device.as_peer_json)
  end

  def unsubscribed
    broadcast_to_rooms("peer_left", { id: current_device.id })
  end

  def heartbeat
    return if current_device.last_seen_at > 1.minute.ago

    current_device.touch_seen!
  end

  def self.broadcast_event(device, type, payload)
    message = { type: type }.merge(payload)
    ActionCable.server.broadcast("room:ip:#{device.ip_hash}", message)
    return if device.room_code.blank?

    ActionCable.server.broadcast("room:code:#{device.room_code}", message)
  end

  private

  def ip_stream
    "room:ip:#{current_device.ip_hash}"
  end

  def code_stream
    "room:code:#{current_device.room_code}"
  end

  def broadcast_to_rooms(type, payload)
    self.class.broadcast_event(current_device, type, payload)
  end
end
