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

export class ElixirBackend extends Cloudflare.Container<ElixirBackend>()(
  "ElixirBackend",
  Effect.gen(function* () {
    const dev = yield* ALCHEMY_DEV;
    const databaseUrl = yield* DatabaseUrl;
    const files = yield* FilesS3;
    const keyBase = yield* BackendSecretKeyBase;
    const expire = yield* ExpireSecret;
    const authOrigin = yield* Config.String("AUTH_ORIGIN").pipe(
      Config.withDefault("http://localhost:3000")
    );
    const googleClientId = yield* Config.String("GOOGLE_CLIENT_ID").pipe(
      Config.withDefault("")
    );
    const googleClientSecret = yield* Config.Redacted(
      "GOOGLE_CLIENT_SECRET"
    ).pipe(Config.withDefault(Redacted.make("")));
    const googleConfigured =
      googleClientId !== "" && Redacted.value(googleClientSecret) !== "";
    const googleSecret =
      googleConfigured && !dev
        ? yield* Cloudflare.SecretsStore.Secret("GoogleOAuthClientSecret", {
            store: yield* Cloudflare.SecretsStore.Store("AnyshareSecrets"),
            value: googleClientSecret,
            scopes: ["containers"],
          })
        : undefined;
    const r2Env =
      files.credentials === undefined
        ? {}
        : {
            R2_ACCESS_KEY_ID: files.credentials.accessKeyId,
            R2_BUCKET: files.bucket,
            R2_ENDPOINT: files.endpoint,
            R2_REGION: "auto",
            R2_SECRET_ACCESS_KEY: files.credentials.secretAccessKey,
          };

    return {
      context: backendDir,
      env: {
        // `alchemy dev` sets the Effect config, not process.env.
        ALCHEMY_DEV: dev ? "true" : "false",
        ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
        // Preserve the browser origin through Alchemy's container loopback rewrite.
        AUTH_ORIGIN: dev ? encodeURIComponent(authOrigin) : authOrigin,
        GOOGLE_CLIENT_ID: googleClientId,
        ...(dev && googleConfigured
          ? { GOOGLE_CLIENT_SECRET: googleClientSecret }
          : {}),
        DATABASE_URL: databaseUrl,
        EXPIRE_SECRET: expire.text,
        PHX_SERVER: "true",
        PORT: String(backendPort),
        SECRET_KEY_BASE: keyBase.text,
        ...r2Env,
      },
      instanceType: "standard-1" as const,
      secrets:
        googleSecret === undefined
          ? []
          : [
              {
                name: "GOOGLE_CLIENT_SECRET",
                type: "env" as const,
                secret: googleSecret.secretName,
              },
            ],
      instances: 1,
      maxInstances: 1,
      observability: { logs: { enabled: true } },
      ports: [{ name: "http", port: backendPort }],
    };
  })
) {}
