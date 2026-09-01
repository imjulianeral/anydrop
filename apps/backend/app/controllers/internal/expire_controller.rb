module Internal
  class ExpireController < ApplicationController
    def create
      unless authorized?
        return render json: { error: "unauthorized" }, status: :unauthorized
      end

      Transfer.expire_stale!
      ShortLink.expire_stale!
      render json: { ok: true }
    end

    private

    def authorized?
      secret = AnyShare.config.expire_secret
      return true if secret.blank? && !Rails.env.production?

      ActiveSupport::SecurityUtils.secure_compare(bearer_token.to_s, secret.to_s)
    end
  end
end
