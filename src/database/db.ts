import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "../utils/env";
import { DB, Timestamp } from "./types";

type KuttDB = {
  links: {
    address: string;
    target: string;
    expire_in: Timestamp;
  };
};

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
    min: 5,
    max: 20,
  }),
});

// TODO: remove after migration
const kuttDialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.KUTT_DATABASE_URL,
    min: 5,
    max: 20,
  }),
});

const kyselyGlobal = global as typeof global & {
  db?: Kysely<DB>;
  // TODO: remove after migration
  kuttDb?: Kysely<KuttDB>;
};

// workaround to make kysely work well during "yarn dev"
// @see https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
export const db =
  kyselyGlobal.db ??
  new Kysely<DB>({
    dialect,
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

// TODO: remove after migration
export const kuttDb =
  kyselyGlobal.kuttDb ??
  new Kysely<KuttDB>({
    dialect: kuttDialect,
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  kyselyGlobal.db = db;
  // TODO: remove after migration
  kyselyGlobal.kuttDb = kuttDb;
}
