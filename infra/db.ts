import { AlchemyContext } from "alchemy";
import { Connection as PrismaConnection } from "alchemy/Prisma/Connection";
import { Postgres } from "alchemy/Prisma/Postgres";
import { Project as PrismaProject } from "alchemy/Prisma/Project";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

import { isLoopbackHost, lanIPv4 } from "./net.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

export const DEV_DATABASE_PORT = 51_214;

export const Project = PrismaProject("Project", {
  createDatabase: false,
  region: "us-east-1",
});

export const Database = Postgres("Database", {
  dev: {
    databasePort: DEV_DATABASE_PORT,
    migrate: "bin/rails db:prepare",
    migrateCwd: backendDir,
  },
  project: Project,
  region: "us-east-1",
});

export const Connection = PrismaConnection("RailsDb", {
  database: Database,
});

const unwrapUrl = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Redacted.isRedacted(value)) {
    const inner = Redacted.value(value);
    return typeof inner === "string" ? inner : undefined;
  }
  return undefined;
};

const rewriteLoopbackHost = (urlString: string): string => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return urlString;
  }
  if (!isLoopbackHost(url.hostname)) {
    return urlString;
  }
  const lan = lanIPv4();
  if (lan === undefined) {
    return urlString;
  }
  url.hostname = lan;
  return url.toString();
};

// Container env must be a concrete string. Returning an Output here makes
// Alchemy skip the variable, and Rails then dies on boot.
export const railsDatabaseUrl = Effect.gen(function* () {
  const alchemy = yield* AlchemyContext;
  const connection = yield* Connection;
  const resolved = unwrapUrl(connection.directConnectionString);

  if (resolved !== undefined) {
    return alchemy.dev ? rewriteLoopbackHost(resolved) : resolved;
  }

  if (!alchemy.dev) {
    return connection.directConnectionString;
  }

  const lan = lanIPv4();
  const host = lan ?? "127.0.0.1";
  return `postgresql://postgres:postgres@${host}:${DEV_DATABASE_PORT}/template1?sslmode=disable`;
});
