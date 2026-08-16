class ApplicationController < ActionController::API
  include ActionController::HttpAuthentication::Token::ControllerMethods

  wrap_parameters false

  rescue_from ActiveRecord::ConnectionNotEstablished do |error|
    render json: { error: error.message }, status: :service_unavailable
  end

  private

  def current_device
    @current_device
  end

  def authenticate_device!
    token = bearer_token
    @current_device = Device.authenticate(token)
    return if @current_device

    render json: { error: "unauthorized" }, status: :unauthorized
  end

  def bearer_token
    authenticate_with_http_token { |token| token } ||
      request.headers["Authorization"]&.delete_prefix("Bearer ")&.strip
  end

  def current_ip_hash
    Rooms.ip_hash(Rooms.connecting_ip(request))
  end
end
