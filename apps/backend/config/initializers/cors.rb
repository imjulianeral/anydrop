Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(
      *Anydrop.config.allowed_origins,
      %r{\Ahttps://anydrop-website-[\w-]+\.[\w-]+\.workers\.dev\z}
    )

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      expose: %w[Authorization],
      max_age: 86_400
  end
end
