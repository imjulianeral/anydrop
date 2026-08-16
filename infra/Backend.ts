import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";

import { railsPort } from "./ports.ts";
import { Rails } from "./Rails.ts";

export default class Backend extends Cloudflare.DurableObject<Backend>()(
  "Backend",
  Effect.gen(function* () {
    const rails = yield* Rails;

    return Effect.gen(function* () {
      const { fetch } = yield* rails.getTcpPort(railsPort);

      return {
        fetch: Effect.gen(function* () {
          const request = yield* HttpServerRequest;
          return yield* fetch(request);
        }),
      };
    });
  }).pipe(
    Effect.provide(Cloudflare.Containers.layer(Rails, { enableInternet: true }))
  )
) {}
