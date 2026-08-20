FROM ruby:4.0.6-bookworm

WORKDIR /app

RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock .ruby-version ./
RUN bundle config set --local without "development test" && bundle install

COPY . .
RUN mkdir -p tmp/pids tmp/storage tmp/cache log && \
    rm -rf tmp/cache/bootsnap && \
    chmod +x bin/docker-entrypoint

# Puma binds PORT inside the container (see config/puma.rb).
ENV PORT=8080
ENV RAILS_ENV=production
ENV DISABLE_BOOTSNAP=1
ENV RAILS_LOG_TO_STDOUT=true
EXPOSE 8080

CMD ["./bin/docker-entrypoint"]
