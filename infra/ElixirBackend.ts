import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { DatabaseUrl } from "./db.ts";
import { FilesS3 } from "./files.ts";
import { backendPort } from "./ports.ts";
import { BackendSecretKeyBase, ExpireSecret } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

export class ElixirBackend extends Cloudflare.Container<ElixirBackend>()(
  "ElixirBackend",
  Effect.gen(function* () {
    const databaseUrl = yield* DatabaseUrl;
    const files = yield* FilesS3;
    const keyBase = yield* BackendSecretKeyBase;
    const expire = yield* ExpireSecret;
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
        ALCHEMY_DEV: process.env.ALCHEMY_DEV ?? "false",
        ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
        DATABASE_URL: databaseUrl,
        EXPIRE_SECRET: expire.text,
        PHX_SERVER: "true",
        PORT: String(backendPort),
        SECRET_KEY_BASE: keyBase.text,
        ...r2Env,
      },
      instanceType: "standard-1" as const,
      instances: 1,
      maxInstances: 1,
      observability: { logs: { enabled: true } },
      ports: [{ name: "http", port: backendPort }],
    };
  })
) {}
