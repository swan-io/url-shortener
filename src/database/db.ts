import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "../utils/env";
import { DB } from "./generated/types";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
  }),
});

const kyselyGlobal = global as typeof global & {
  db?: Kysely<DB>;
};

// workaround to make kysely work well during "yarn dev"
// @see https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
export const db =
  kyselyGlobal.db ??
  new Kysely<DB>({
    dialect,
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  kyselyGlobal.db = db;
}
