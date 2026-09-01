require "aws-sdk-s3"

module ObjectStore
  PRESIGN_TTL = 15.minutes

  module_function

  def presign_put(key, content_type:, byte_size:)
    if AnyShare.config.r2_configured?
      url = presigner.presigned_url(
        :put_object,
        bucket: bucket_name,
        key: key,
        content_type: content_type,
        content_length: byte_size,
        expires_in: PRESIGN_TTL.to_i
      )
      { url: url, headers: { "Content-Type" => content_type } }
    else
      {
        url: "/api/v1/local_blobs/#{ERB::Util.url_encode(key)}",
        headers: { "Content-Type" => content_type }
      }
    end
  end

  def presign_get(key)
    if AnyShare.config.r2_configured?
      presigner.presigned_url(
        :get_object,
        bucket: bucket_name,
        key: key,
        expires_in: PRESIGN_TTL.to_i
      )
    else
      "/api/v1/local_blobs/#{ERB::Util.url_encode(key)}"
    end
  end

  def delete(key)
    return local_path(key).delete if local_path(key).exist? && !AnyShare.config.r2_configured?

    client.delete_object(bucket: bucket_name, key: key) if AnyShare.config.r2_configured?
  rescue Aws::S3::Errors::ServiceError
    nil
  end

  def write_local(key, body)
    path = local_path(key)
    path.dirname.mkpath
    path.binwrite(body)
  end

  def read_local(key)
    path = local_path(key)
    return unless path.exist?

    path.binread
  end

  def local_path(key)
    Rails.root.join("tmp/storage", key)
  end

  def bucket_name
    ENV.fetch("R2_BUCKET")
  end

  def client
    @client ||= Aws::S3::Client.new(
      access_key_id: ENV.fetch("R2_ACCESS_KEY_ID"),
      secret_access_key: ENV.fetch("R2_SECRET_ACCESS_KEY"),
      endpoint: ENV.fetch("R2_ENDPOINT"),
      region: ENV.fetch("R2_REGION", "auto"),
      force_path_style: true
    )
  end

  def presigner
    @presigner ||= Aws::S3::Presigner.new(client: client)
  end
end
