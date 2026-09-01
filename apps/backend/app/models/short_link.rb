class ShortLink < ApplicationRecord
  self.primary_key = "code"

  TTL = 7.days
  CODE = /\A[A-Z0-9]{7}\z/
  MAX_URL = 2048

  belongs_to :device, optional: true
  belongs_to :transfer, optional: true

  before_validation :assign_code, on: :create
  before_validation :assign_expiry, on: :create

  validates :code, presence: true, uniqueness: true, format: { with: CODE }
  validates :target_url, presence: true, length: { maximum: MAX_URL }, unless: :transfer_id?
  validate :http_url, if: :target_url?

  scope :live, -> { where(expires_at: Time.current...) }

  def self.issue_code
    8.times do
      candidate = SecureRandom.alphanumeric(7).upcase
      return candidate unless exists?(code: candidate)
    end
    raise "could not allocate short code"
  end

  def self.expire_stale!
    where(expires_at: ..Time.current).delete_all
  end

  def as_json_payload
    payload = {
      code: code,
      expires_at: expires_at.iso8601
    }
    if transfer
      payload.merge!(transfer.as_drop_json)
      if transfer.file? && transfer.status.in?(%w[uploaded delivered]) && transfer.r2_key.present?
        payload[:download] = { url: ObjectStore.presign_get(transfer.r2_key) }
      end
    else
      payload[:kind] = "url"
      payload[:url] = target_url
    end
    payload
  end

  private

  def assign_code
    self.code ||= self.class.issue_code
  end

  def assign_expiry
    self.expires_at ||= TTL.from_now
    self.created_at ||= Time.current
  end

  def http_url
    uri = URI.parse(target_url.to_s)
    return if uri.is_a?(URI::HTTP) && uri.host.present?

    errors.add(:target_url, "must be an http or https URL")
  rescue URI::InvalidURIError
    errors.add(:target_url, "must be an http or https URL")
  end
end
