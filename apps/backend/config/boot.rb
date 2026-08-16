ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# Rails prefers ENV["DATABASE_URL"] over database.yml. Drop Prisma's
# prisma+postgres:// URL and JSON Redacted markers before Rails loads.
%w[DATABASE_URL DIRECT_URL].each do |key|
  value = ENV[key].to_s
  ENV.delete(key) unless value.match?(/\Apostgres(?:ql)?:\/\//i)
end

# The Cloudflare container cannot use host loopback. Alchemy sets
# ANYDROP_PG_HOST only in `alchemy dev`.
pg_host = ENV["ANYDROP_PG_HOST"].to_s
unless pg_host.empty?
  %w[DATABASE_URL DIRECT_URL].each do |key|
    value = ENV[key]
    next if value.nil?

    ENV[key] = value.gsub(/\b(?:127\.0\.0\.1|localhost|\[::1\])\b/, pg_host)
  end

  if ENV["DATABASE_URL"].to_s.empty?
    port = ENV.fetch("ANYDROP_PG_PORT", "51214")
    ENV["DATABASE_URL"] =
      "postgresql://postgres:postgres@#{pg_host}:#{port}/template1?sslmode=disable"
  end
end

if ENV["RAILS_ENV"] == "production" && ENV["SECRET_KEY_BASE"].to_s.empty?
  ENV["SECRET_KEY_BASE"] = "anydrop-container-dev-secret-key-base-please-override"
end

require "bundler/setup" # Set up gems listed in the Gemfile.
# Host-compiled Bootsnap caches crash inside the container (different Ruby).
require "bootsnap/setup" unless ENV["DISABLE_BOOTSNAP"] == "1"
