ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# Alchemy may pack secrets as {"_tag":"Redacted","value":"..."}.
# Rails needs a libpq URI; prisma+postgres:// would make it use the default socket.
require "json"
%w[DATABASE_URL DIRECT_URL].each do |key|
  value = ENV[key].to_s
  if value.start_with?("{")
    begin
      parsed = JSON.parse(value)
      value = parsed["value"].to_s if parsed.is_a?(Hash) && parsed["_tag"] == "Redacted"
    rescue JSON::ParserError
      # keep the raw value
    end
  end
  if value.match?(/\Apostgres(?:ql)?:\/\//i)
    ENV[key] = value
  else
    ENV.delete(key)
  end
end

# Only the Cloudflare container sets ANYDROP_PG_HOST. Host-side
# `bin/rails db:prepare` must keep 127.0.0.1 so it can reach @prisma/dev.
pg_host = ENV["ANYDROP_PG_HOST"].to_s
pg_port = ENV["ANYDROP_PG_PORT"].to_s
unless pg_host.empty?
  %w[DATABASE_URL DIRECT_URL].each do |key|
    value = ENV[key]
    next if value.nil?

    rewritten = value.gsub(/\b(?:127\.0\.0\.1|localhost|\[::1\])\b/, pg_host)
    unless pg_port.empty?
      rewritten = rewritten.sub(
        /@#{Regexp.escape(pg_host)}(?::\d+)?/,
        "@#{pg_host}:#{pg_port}"
      )
    end
    rewritten = rewritten.sub(/[?&]sslmode=[^&]*/, "")
    rewritten = rewritten.sub(/[?&]$/, "")
    rewritten += rewritten.include?("?") ? "&sslmode=disable" : "?sslmode=disable"
    ENV[key] = rewritten
  end

  if ENV["DATABASE_URL"].to_s.empty?
    port = pg_port.empty? ? "51214" : pg_port
    ENV["DATABASE_URL"] =
      "postgresql://postgres:postgres@#{pg_host}:#{port}/template1?sslmode=disable"
  end
end

require "bundler/setup" # Set up gems listed in the Gemfile.
# Host-compiled Bootsnap caches crash inside the container (different Ruby).
require "bootsnap/setup" unless ENV["DISABLE_BOOTSNAP"] == "1"
