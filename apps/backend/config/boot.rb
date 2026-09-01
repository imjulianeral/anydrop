ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# Alchemy may pack secrets as {"_tag":"Redacted","value":"..."}.
require "json"
value = ENV["DATABASE_URL"].to_s
if value.start_with?("{")
  begin
    parsed = JSON.parse(value)
    value = parsed["value"].to_s if parsed.is_a?(Hash) && parsed["_tag"] == "Redacted"
  rescue JSON::ParserError
    # keep the raw value
  end
end
if value.match?(/\Apostgres(?:ql)?:\/\//i)
  ENV["DATABASE_URL"] = value
else
  ENV.delete("DATABASE_URL")
end

require "bundler/setup" # Set up gems listed in the Gemfile.
# Host-compiled Bootsnap caches crash inside the container (different Ruby).
require "bootsnap/setup" unless ENV["DISABLE_BOOTSNAP"] == "1"
