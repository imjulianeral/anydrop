class Device < ApplicationRecord
  KINDS = %w[phone tablet desktop].freeze
  ROOM_CODE = /\A[A-Z0-9]{6}\z/
  ONLINE_WINDOW = 2.minutes

  has_many :sent_transfers, class_name: "Transfer", foreign_key: :sender_id, inverse_of: :sender, dependent: :destroy
  has_many :received_transfers, class_name: "Transfer", foreign_key: :recipient_id, inverse_of: :recipient, dependent: :destroy

  validates :display_name, presence: true, length: { maximum: 40 }
  validates :device_kind, inclusion: { in: KINDS }
  validates :ip_hash, presence: true
  validates :token_digest, presence: true
  validates :room_code, format: { with: ROOM_CODE }, allow_nil: true

  scope :online, -> { where(last_seen_at: ONLINE_WINDOW.ago..) }

  def self.digest(token)
    Digest::SHA256.hexdigest(token)
  end

  def self.authenticate(token)
    return if token.blank?

    find_by(token_digest: digest(token))
  end

  def self.issue_token
    SecureRandom.hex(32)
  end

  def self.peers_for(device)
    relation = online.where.not(id: device.id).where(ip_hash: device.ip_hash)
    return relation if device.room_code.blank?

    relation.or(online.where.not(id: device.id).where(room_code: device.room_code))
  end

  def touch_seen!
    update!(last_seen_at: Time.current)
  end

  def as_peer_json
    {
      id: id,
      display_name: display_name,
      device_kind: device_kind,
      room_code: room_code,
      last_seen_at: last_seen_at.iso8601
    }
  end
end
