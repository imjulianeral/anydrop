import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";

import Backend from "./Backend.ts";

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  { crons: ["0 * * * *"], main: import.meta.url },
  Effect.gen(function* () {
    const backends = yield* Backend;

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        return yield* backends.getByName("default").fetch(request);
      }),
    };
  })
) {}
