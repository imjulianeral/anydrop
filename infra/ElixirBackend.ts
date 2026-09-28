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

const optionalString = (name: string) =>
  Config.String(name).pipe(Config.withDefault(""));

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
        GOOGLE_CLIENT_ID: yield* optionalString("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: yield* optionalSecret("GOOGLE_CLIENT_SECRET"),
        // Team invitations. Without MAIL_FROM they are logged, not sent.
        // See docs/email.md for the DNS records direct delivery needs.
        MAIL_DKIM_PRIVATE_KEY: yield* optionalSecret("MAIL_DKIM_PRIVATE_KEY"),
        MAIL_DKIM_SELECTOR: yield* optionalString("MAIL_DKIM_SELECTOR"),
        MAIL_FROM: yield* optionalString("MAIL_FROM"),
        MAIL_HELO_DOMAIN: yield* optionalString("MAIL_HELO_DOMAIN"),
        MAIL_RELAY: yield* optionalString("MAIL_RELAY"),
        MAIL_RELAY_PASSWORD: yield* optionalSecret("MAIL_RELAY_PASSWORD"),
        MAIL_RELAY_PORT: yield* optionalString("MAIL_RELAY_PORT"),
        MAIL_RELAY_USERNAME: yield* optionalString("MAIL_RELAY_USERNAME"),
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
