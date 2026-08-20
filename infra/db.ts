import * as Cloudflare from "alchemy/Cloudflare";
import * as Prisma from "alchemy/Prisma";
import * as Effect from "effect/Effect";

export const region = "us-east-1" as const;
export const DEV_DATABASE_PORT = 51_214;

const backendDir = `${import.meta.dirname}/../apps/backend`;

export const DB = Effect.gen(function* () {
  const project = yield* Prisma.Project("AnyDrop", {
    createDatabase: false,
    region,
  });

  const postgres = yield* Prisma.Postgres("DB", {
    project,
    region,
    branchGitName: "main",
    dev: {
      name: "anydrop",
      databasePort: DEV_DATABASE_PORT,
      migrate: "bin/rails db:prepare",
      migrateCwd: backendDir,
    },
  });

  const connection = yield* Prisma.Connection("API", {
    database: postgres,
  });

  return { project, postgres, connection };
});

export const Hyperdrive = Effect.gen(function* () {
  const db = yield* DB;
  return yield* Cloudflare.Hyperdrive.Connection("Hyperdrive", {
    origin: db.connection.origin.as<Prisma.PostgresOrigin>(),
    dev: db.connection.pooledOrigin,
  });
});
