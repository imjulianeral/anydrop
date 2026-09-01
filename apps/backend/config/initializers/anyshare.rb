module AnyShare
  class Config
    def allowed_origins
      raw = ENV.fetch("ALLOWED_ORIGINS", "")
      extra = raw.split(",").map(&:strip).reject(&:blank?)
      [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        *extra
      ].uniq
    end

    def expire_secret
      ENV["EXPIRE_SECRET"].presence
    end

    def r2_configured?
      ENV["R2_ACCESS_KEY_ID"].present? &&
        ENV["R2_SECRET_ACCESS_KEY"].present? &&
        ENV["R2_BUCKET"].present? &&
        ENV["R2_ENDPOINT"].present?
    end
  end

  def self.config
    @config ||= Config.new
  end
end
