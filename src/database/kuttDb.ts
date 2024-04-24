// TODO: remove this file once migration is done

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { env } from "../utils/env";
import { DB } from "./generated/types";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.KUTT_DATABASE_URL,
    min: 5,
    max: 20,
  }),
});

const kyselyGlobal = global as typeof global & {
  kuttDb?: Kysely<DB>;
};

// workaround to make kysely work well during "yarn dev"
// @see https://www.prisma.io/docs/support/help-articles/nextjs-prisma-client-dev-practices
export const kuttDb =
  kyselyGlobal.kuttDb ??
  new Kysely<DB>({
    dialect,
    log: env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  kyselyGlobal.kuttDb = kuttDb;
}
