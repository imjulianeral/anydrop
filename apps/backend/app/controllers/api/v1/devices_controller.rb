module Api
  module V1
    class DevicesController < ApplicationController
      before_action :authenticate_device!

      def update
        current_device.display_name = device_params[:display_name] if device_params.key?(:display_name)
        if device_params.key?(:room_code)
          current_device.room_code = Rooms.normalize_code(device_params[:room_code])
        end
        current_device.ip_hash = current_ip_hash
        current_device.last_seen_at = Time.current

        unless current_device.save
          return render json: { error: current_device.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        RoomChannel.broadcast_event(current_device, "peer_updated", current_device.as_peer_json)
        render json: {
          device: current_device.as_peer_json,
          peers: Device.peers_for(current_device).map(&:as_peer_json)
        }
      end

      private

      def device_params
        params.permit(:display_name, :room_code)
      end
    end
  end
end
