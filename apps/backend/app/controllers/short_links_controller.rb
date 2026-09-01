class ShortLinksController < ActionController::API
  def show
    link = ShortLink.live.find_by(code: params[:code].to_s.upcase)
    return head :not_found unless link

    if link.transfer&.file? && link.transfer.status.in?(%w[uploaded delivered]) && link.transfer.r2_key.present?
      return redirect_to ObjectStore.presign_get(link.transfer.r2_key), allow_other_host: true, status: :found
    end
    if link.transfer&.text?
      return render plain: link.transfer.body, content_type: "text/plain"
    end
    return head :not_found unless link.target_url

    redirect_to link.target_url, allow_other_host: true, status: :found
  end
end
