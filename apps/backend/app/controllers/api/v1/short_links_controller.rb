module Api
  module V1
    class ShortLinksController < ApplicationController
      before_action :authenticate_device!, only: %i[index create]

      def index
        links = current_device.short_links.live.includes(:transfer).order(created_at: :desc)
        render json: { short_links: links.map(&:as_json_payload) }
      end

      def create
        link = current_device.short_links.new(target_url: params[:url].to_s.strip)
        unless link.save
          return render json: { error: link.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        render json: { short_link: link.as_json_payload }, status: :created
      end

      def show
        link = ShortLink.live.find_by(code: params[:id].to_s.upcase)
        return render json: { error: "not found" }, status: :not_found unless link

        render json: { short_link: link.as_json_payload }
      end
    end
  end
end
