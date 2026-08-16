module Api
  module V1
    class LocalBlobsController < ApplicationController
      def show
        body = ObjectStore.read_local(params[:key])
        return head :not_found unless body

        send_data body, disposition: "attachment", filename: File.basename(params[:key])
      end

      def update
        ObjectStore.write_local(params[:key], request.raw_post)
        head :created
      end
    end
  end
end
