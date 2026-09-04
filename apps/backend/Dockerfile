ARG ELIXIR_VERSION=1.20.4
ARG OTP_VERSION=29.0.6
ARG ALPINE_VERSION=3.24.1

FROM hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-alpine-${ALPINE_VERSION} AS build

RUN apk add --no-cache build-base git

WORKDIR /app
ENV LANG=C.UTF-8
ENV MIX_ENV=prod

RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile

COPY config config
COPY lib lib
COPY priv priv
RUN mix compile && mix release

FROM alpine:${ALPINE_VERSION} AS runtime

RUN apk add --no-cache ca-certificates libgcc libstdc++ ncurses-libs openssl

WORKDIR /app
RUN adduser -D -H -h /app -s /sbin/nologin anyshare

COPY --from=build --chown=anyshare:anyshare /app/_build/prod/rel/anyshare ./
COPY --chown=anyshare:anyshare bin/docker-entrypoint ./bin/docker-entrypoint
RUN chmod +x ./bin/docker-entrypoint && mkdir -p tmp/storage && chown -R anyshare:anyshare tmp

USER anyshare
ENV HOME=/app
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV PHX_SERVER=true
ENV PORT=8080
ENV RELEASE_DISTRIBUTION=none
EXPOSE 8080

CMD ["./bin/docker-entrypoint"]
