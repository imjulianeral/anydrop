class Transfer < ApplicationRecord
  KINDS = %w[file text].freeze
  STATUSES = %w[pending uploaded delivered expired failed].freeze
  MAX_FILE_BYTES = 2.gigabytes
  MAX_TEXT_BYTES = 64.kilobytes
  TTL = 24.hours

  belongs_to :sender, class_name: "Device"
  belongs_to :recipient, class_name: "Device", optional: true
  has_many :short_links, dependent: :delete_all

  before_validation :assign_id, on: :create

  validates :kind, inclusion: { in: KINDS }
  validates :status, inclusion: { in: STATUSES }
  validates :filename, presence: true, if: :file?
  validates :byte_size, numericality: { greater_than: 0, less_than_or_equal_to: MAX_FILE_BYTES }, if: :file?
  validates :body, presence: true, length: { maximum: MAX_TEXT_BYTES }, if: :text?

  scope :active, -> { where.not(status: %w[expired failed]) }

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def file?
    kind == "file"
  end

  def text?
    kind == "text"
  end

  def self.expire_stale!
    stale = where(status: %w[pending uploaded delivered]).where(expires_at: ...Time.current)
    stale.find_each do |transfer|
      ObjectStore.delete(transfer.r2_key) if transfer.r2_key.present?
      transfer.update!(status: "expired")
    end
  end

  def as_json_for(viewer)
    payload = {
      id: id,
      sender_id: sender_id,
      recipient_id: recipient_id,
      kind: kind,
      filename: filename,
      byte_size: byte_size,
      content_type: content_type,
      status: status,
      expires_at: expires_at.iso8601,
      created_at: created_at.iso8601
    }
    payload[:body] = body if text? && (viewer.id == recipient_id || viewer.id == sender_id)
    payload
  end

  def as_drop_json
    payload = {
      id: id,
      kind: kind,
      filename: filename,
      byte_size: byte_size,
      content_type: content_type,
      status: status,
      expires_at: expires_at.iso8601
    }
    payload[:body] = body if text?
    payload
  end
end
