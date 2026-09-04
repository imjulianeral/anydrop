import { ALCHEMY_DEV } from "alchemy";
import * as Docker from "alchemy/Docker";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";

export const DEV_DATABASE_PORT = 51_214;

export const localDatabaseUrl = `postgresql://postgres:postgres@host.docker.internal:${DEV_DATABASE_PORT}/postgres?sslmode=disable`;

export const LocalPostgres = Docker.Container("Postgres", {
  environment: {
    POSTGRES_DB: "postgres",
    POSTGRES_HOST_AUTH_METHOD: "trust",
    POSTGRES_PASSWORD: "postgres",
    POSTGRES_USER: "postgres",
  },
  healthcheck: {
    cmd: ["CMD-SHELL", "pg_isready -U postgres"],
    interval: "2 seconds",
    retries: 15,
    timeout: "2 seconds",
  },
  image: "postgres:18.6-alpine",
  ports: [{ external: DEV_DATABASE_PORT, internal: 5432 }],
  restart: "unless-stopped",
  start: true,
});

export const DatabaseUrl = Effect.gen(function* () {
  if (yield* ALCHEMY_DEV) {
    if (!globalThis.__ALCHEMY_RUNTIME__) {
      yield* LocalPostgres;
    }
    return localDatabaseUrl;
  }

  const database = yield* Planetscale.PostgresDatabase("DB", {
    clusterSize: "PS_10",
    majorVersion: "18",
    region: { slug: "us-east" },
    replicas: 0,
  });
  const role = yield* Planetscale.PostgresRole("API", {
    database,
    inheritedRoles: ["postgres"],
  });
  return role.connectionUrl;
});
