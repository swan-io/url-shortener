import dayjs from "dayjs";
import { sql } from "kysely";
import fs from "node:fs/promises";
import path from "node:path";
import { PostgresMock } from "pgmock";
import { beforeAll, expect, test } from "vitest";
import { deleteExpiredLinks } from "../src/database/db";
import { addToNow } from "../src/utils/time";

const timeout = 60000;

beforeAll(async () => {
  const [mock, schema] = await Promise.all([
    PostgresMock.create(),
    fs.readFile(path.join(__dirname, "schema.sql"), "utf-8"),
  ]);

  await mock.listen(25432);
  const { db } = await import("../src/database/db");

  // @ts-expect-error
  const migrate = sql(schema);
  await db.executeQuery(migrate.compile(db));

  return () => mock.destroy();
}, timeout);

test("correctly insert and get a link", { timeout }, async () => {
  const { createLink, getLink } = await import("../src/database/db");

  const { address } = await createLink({
    target: "https://swan.io",
    expired_at: addToNow("1h"),
  });

  const link = await getLink(address);
  expect(link?.target).toBe("https://swan.io");
});

test("don't return an expired link", { timeout }, async () => {
  const { createLink, getLink } = await import("../src/database/db");

  const { address } = await createLink({
    target: "https://swan.io",
    expired_at: dayjs("01/01/1970").toISOString(),
  });

  const link = await getLink(address);
  expect(link).toBeUndefined();

  const { numDeletedRows } = await deleteExpiredLinks();
  expect(numDeletedRows).toBe(BigInt(1));
});

test("delete expired links", { timeout }, async () => {
  const { createLink } = await import("../src/database/db");

  await Promise.all([
    createLink({
      target: "https://swan.io",
      expired_at: dayjs("01/01/1970").toISOString(),
    }),
    createLink({
      target: "https://swan.io",
      expired_at: dayjs("01/01/2050").toISOString(),
    }),
  ]);

  const { numDeletedRows } = await deleteExpiredLinks();
  expect(numDeletedRows).toBe(BigInt(1));
});
