import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { generateAddress } from "../utils/address";
import { env } from "../utils/env";
import { DB } from "./generated/types";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
    min: 5,
    max: 20,
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

export const getLink = (address: string) =>
  db
    .selectFrom("links")
    .select("target")
    .where("address", "=", address)
    .where(sql<boolean>`expired_at >= CURRENT_TIMESTAMP`)
    .executeTakeFirst();

export const createLink = (input: { target: string; expired_at: string }) =>
  db
    .insertInto("links")
    .values({ ...input, address: generateAddress() })
    .returning(["address"])
    .executeTakeFirstOrThrow();

export const deleteExpiredLinks = () =>
  db
    .deleteFrom("links")
    .where(sql<boolean>`expired_at < CURRENT_TIMESTAMP`)
    .executeTakeFirstOrThrow();
