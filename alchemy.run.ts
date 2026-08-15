// alchemy.run.ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Prisma from "alchemy/Prisma";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export default Alchemy.Stack(
  "AnyDrop",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Prisma.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.Bucket("Bucket");

    return {
      bucketName: bucket.bucketName,
    };
  })
);
