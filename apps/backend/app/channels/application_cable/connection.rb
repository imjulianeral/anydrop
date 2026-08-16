module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_device

    def connect
      self.current_device = find_device
    end

    private

    def find_device
      token = request.params[:token].presence
      device = Device.authenticate(token)
      return reject_unauthorized_connection unless device

      device.touch_seen!
      device
    end
  end
end
