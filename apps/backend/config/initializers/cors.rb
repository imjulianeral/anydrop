Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(
      *AnyShare.config.allowed_origins,
      %r{\Ahttps://anyshare-website-[\w-]+\.[\w-]+\.workers\.dev\z}
    )

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      expose: %w[Authorization],
      max_age: 86_400
  end
end
