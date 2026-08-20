import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { Hyperdrive, DB } from "./db.ts";
import { railsPort } from "./ports.ts";
import { ExpireSecret, SecretKeyBase } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

const env = Effect.gen(function* () {
  const hd = yield* Cloudflare.Hyperdrive.Connect(Hyperdrive);
  const db = yield* DB;
  const keyBase = yield* SecretKeyBase;
  const expire = yield* ExpireSecret;

  return {
    keyBase: Output.asOutput(keyBase.text),
    expire: Output.asOutput(expire.text),
    dbURL: Redacted.value(yield* hd.connectionString),
    dbDirectURL: db.connection.directConnectionString.pipe(
      Output.map((url) => (url === undefined ? "" : Redacted.value(url)))
    ),
  };
});

export class Rails extends Cloudflare.Container<Rails>()("Rails", {
  context: backendDir,
  env: {
    ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
    DATABASE_URL: env.pipe(Effect.map((e) => e.dbURL)),
    DIRECT_URL: env.pipe(Effect.map((e) => e.dbDirectURL)),
    EXPIRE_SECRET: env.pipe(Effect.map((e) => e.expire)),
    SECRET_KEY_BASE: env.pipe(Effect.map((e) => e.keyBase)),
    PORT: String(railsPort),
    RAILS_ENV: "production",
  },
  instanceType: "standard-1" as const,
  instances: 1,
  maxInstances: 1,
  observability: { logs: { enabled: true } },
  ports: [{ name: "http", port: railsPort }],
}) {}
