import { ALCHEMY_DEV } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import Backend from "./Backend.ts";
import { corsHeaders } from "./cors.ts";

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  Effect.gen(function* () {
    const dev = yield* ALCHEMY_DEV;
    return {
      crons: ["0 * * * *"],
      env: {
        ALCHEMY_DEV: dev ? "true" : "false",
        ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
      },
      main: import.meta.url,
    };
  }),
  Effect.gen(function* () {
    const backends = yield* Backend;
    const env = yield* Cloudflare.Workers.WorkerEnvironment;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const allowedOrigins = String(
          (env as Record<string, unknown>).ALLOWED_ORIGINS ?? ""
        );
        const headers = corsHeaders(
          request.headers.origin,
          allowedOrigins,
          request.originalUrl
        );

        if (request.method === "OPTIONS") {
          return HttpServerResponse.empty({ status: 204, headers });
        }

        return yield* backends
          .getByName("default")
          .fetch(request)
          .pipe(
            Effect.map((response) =>
              response.status === 101
                ? response
                : HttpServerResponse.setHeaders(response, headers)
            ),
            Effect.orElseSucceed(() =>
              HttpServerResponse.text("Backend unavailable", {
                status: 503,
                headers,
              })
            )
          );
      }),
    };
  })
) {}
