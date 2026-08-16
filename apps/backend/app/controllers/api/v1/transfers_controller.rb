module Api
  module V1
    class TransfersController < ApplicationController
      before_action :authenticate_device!

      def create
        recipient = find_visible_peer(transfer_params[:recipient_id])
        return render json: { error: "recipient not found" }, status: :not_found unless recipient

        transfer = build_transfer(recipient)
        unless transfer.save
          return render json: { error: transfer.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end

        if transfer.text?
          RoomChannel.broadcast_event(recipient, "text_received", transfer.as_json_for(recipient))
          return render json: { transfer: transfer.as_json_for(current_device) }, status: :created
        end

        upload = ObjectStore.presign_put(
          transfer.r2_key,
          content_type: transfer.content_type.presence || "application/octet-stream",
          byte_size: transfer.byte_size
        )
        render json: { transfer: transfer.as_json_for(current_device), upload: upload }, status: :created
      end

      def show
        transfer = visible_transfer
        return render json: { error: "not found" }, status: :not_found unless transfer

        payload = { transfer: transfer.as_json_for(current_device) }
        if transfer.file? && transfer.status.in?(%w[uploaded delivered]) && transfer.r2_key.present?
          payload[:download] = { url: ObjectStore.presign_get(transfer.r2_key) }
        end
        render json: payload
      end

      def complete
        transfer = current_device.sent_transfers.find_by(id: params[:id])
        return render json: { error: "not found" }, status: :not_found unless transfer
        return render json: { error: "already completed" }, status: :conflict unless transfer.status == "pending"

        transfer.update!(status: "uploaded")
        download_url = ObjectStore.presign_get(transfer.r2_key) if transfer.file?
        RoomChannel.broadcast_event(
          transfer.recipient,
          "transfer_offered",
          transfer.as_json_for(transfer.recipient).merge(download: download_url ? { url: download_url } : nil)
        )
        render json: { transfer: transfer.as_json_for(current_device) }
      end

      private

      def transfer_params
        params.permit(:recipient_id, :kind, :filename, :byte_size, :content_type, :body)
      end

      def find_visible_peer(id)
        Device.peers_for(current_device).find_by(id: id)
      end

      def visible_transfer
        Transfer.where(sender_id: current_device.id).or(Transfer.where(recipient_id: current_device.id)).find_by(id: params[:id])
      end

      def build_transfer(recipient)
        kind = transfer_params[:kind].presence || "file"
        transfer = Transfer.new(
          sender: current_device,
          recipient: recipient,
          kind: kind,
          filename: transfer_params[:filename],
          byte_size: transfer_params[:byte_size],
          content_type: transfer_params[:content_type],
          body: transfer_params[:body],
          status: kind == "text" ? "delivered" : "pending",
          expires_at: Transfer::TTL.from_now,
          created_at: Time.current
        )
        if transfer.file?
          transfer.r2_key = "transfers/#{Time.current.utc.strftime("%Y-%m-%d")}/#{SecureRandom.uuid}/#{sanitize_filename(transfer.filename)}"
        end
        transfer
      end

      def sanitize_filename(name)
        File.basename(name.to_s).gsub(/[^A-Za-z0-9._-]/, "_").presence || "file"
      end
    end
  end
end
