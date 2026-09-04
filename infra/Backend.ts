import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";

import { ElixirBackend } from "./ElixirBackend.ts";
import { backendPort } from "./ports.ts";

export default class Backend extends Cloudflare.DurableObject<Backend>()(
  "Backend",
  Effect.gen(function* () {
    const backend = yield* ElixirBackend;

    return Effect.gen(function* () {
      const { fetch } = yield* backend.getTcpPort(backendPort);

      return {
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          return yield* fetch(request);
        }),
      };
    });
  }).pipe(
    Effect.provide(
      Cloudflare.Containers.layer(ElixirBackend, { enableInternet: true })
    )
  )
) {}
