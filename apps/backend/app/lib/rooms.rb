module Rooms
  module_function

  def ip_hash(ip)
    Digest::SHA256.hexdigest(ip.to_s)
  end

  def connecting_ip(request)
    request.get_header("HTTP_CF_CONNECTING_IP").presence ||
      request.remote_ip
  end

  def generate_code
    SecureRandom.alphanumeric(6).upcase
  end

  def normalize_code(value)
    return if value.blank?

    value.to_s.upcase.gsub(/[^A-Z0-9]/, "").presence
  end
end
