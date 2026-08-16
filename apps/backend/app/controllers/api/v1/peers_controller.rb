module Api
  module V1
    class PeersController < ApplicationController
      before_action :authenticate_device!

      def index
        current_device.touch_seen! if current_device.last_seen_at < 1.minute.ago
        render json: { peers: Device.peers_for(current_device).map(&:as_peer_json) }
      end
    end
  end
end
