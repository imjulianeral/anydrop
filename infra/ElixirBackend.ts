import { ALCHEMY_DEV } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { DatabaseUrl } from "./db.ts";
import { FilesS3 } from "./files.ts";
import { backendPort } from "./ports.ts";
import { BackendSecretKeyBase, ExpireSecret } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

// Unset keys become "", which config/runtime.exs treats as disabled.
const optionalSecret = (name: string) =>
  Config.Redacted(name).pipe(Config.withDefault(Redacted.make("")));

export class ElixirBackend extends Cloudflare.Container<ElixirBackend>()(
  "ElixirBackend",
  Effect.gen(function* () {
    const files = yield* FilesS3;
    const authOrigin = yield* Config.String("AUTH_ORIGIN").pipe(
      Config.withDefault("http://localhost:3000")
    );

    return {
      context: backendDir,
      env: {
        // `alchemy dev` sets the Effect config, not process.env.
        ALCHEMY_DEV: String(yield* ALCHEMY_DEV),
        // Encoded to survive Alchemy's dev loopback rewrite; runtime.exs decodes it.
        AUTH_ORIGIN: encodeURIComponent(authOrigin),
        DATABASE_URL: yield* DatabaseUrl,
        EXPIRE_SECRET: (yield* ExpireSecret).text,
        GOOGLE_CLIENT_ID: yield* Config.String("GOOGLE_CLIENT_ID").pipe(
          Config.withDefault("")
        ),
        GOOGLE_CLIENT_SECRET: yield* optionalSecret("GOOGLE_CLIENT_SECRET"),
        MALWARE_BAZAAR_AUTH_KEY: yield* optionalSecret(
          "MALWARE_BAZAAR_AUTH_KEY"
        ),
        PHX_SERVER: "true",
        PORT: String(backendPort),
        R2_ACCESS_KEY_ID: files.credentials.accessKeyId,
        R2_BUCKET: files.bucket,
        R2_ENDPOINT: files.endpoint,
        R2_SECRET_ACCESS_KEY: files.credentials.secretAccessKey,
        SECRET_KEY_BASE: (yield* BackendSecretKeyBase).text,
        WEB_RISK_API_KEY: yield* optionalSecret("WEB_RISK_API_KEY"),
      },
      instanceType: "standard-1" as const,
      instances: 1,
      maxInstances: 1,
      observability: { logs: { enabled: true } },
      ports: [{ name: "http", port: backendPort }],
    };
  })
) {}
