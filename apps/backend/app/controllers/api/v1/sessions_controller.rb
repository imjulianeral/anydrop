module Api
  module V1
    class SessionsController < ApplicationController
      def create
        attrs = session_params
        unless attrs[:id].to_s.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i)
          return render json: { error: "invalid id" }, status: :unprocessable_entity
        end

        device = Device.find_or_initialize_by(id: attrs[:id])
        token = Device.issue_token
        device.assign_attributes(
          display_name: attrs[:display_name].presence || device.display_name.presence || DeviceName.generate,
          device_kind: attrs[:device_kind].presence || device.device_kind.presence || "desktop",
          ip_hash: current_ip_hash,
          token_digest: Device.digest(token),
          last_seen_at: Time.current,
          created_at: device.created_at || Time.current
        )

        unless device.save
          return render json: { error: device.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        RoomChannel.broadcast_event(device, "peer_updated", device.as_peer_json)
        render json: {
          token: token,
          device: device.as_peer_json,
          peers: Device.peers_for(device).map(&:as_peer_json)
        }, status: :created
      end

      private

      def session_params
        params.permit(:id, :display_name, :device_kind)
      end
    end
  end
end
