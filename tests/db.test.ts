import dayjs from "dayjs";
import { sql } from "kysely";
import fs from "node:fs/promises";
import path from "node:path";
import { PostgresMock } from "pgmock";
import { afterEach, beforeAll, expect, test } from "vitest";
import { generateAddress } from "../src/utils/address";
import { env } from "../src/utils/env";

const serverUrl = `http://0.0.0.0:4000/${env.SERVER_PORT}`;
const timeout = 30000;

const past = dayjs("01/01/1970").toISOString();
const future = dayjs("01/01/2070").toISOString();

const kuttRepositoryTarget = "https://github.com/thedevs-network/kutt";
const kuttRepositoryAddress = generateAddress();
const valienvRepositoryTarget = "https://github.com/zoontek/valienv";
const valienvRepositoryAddress = generateAddress();

const kuttSchema = sql`
CREATE TABLE "links" (
  "address" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "expire_in" TIMESTAMP(3) NOT NULL
);
`;

beforeAll(async () => {
  const [dbMock, kuttMock] = await Promise.all([
    PostgresMock.create(),
    PostgresMock.create(),
  ]);

  await Promise.all([dbMock.listen(25432), kuttMock.listen(35432)]);

  const { db, kuttDb } = await import("../src/database/db");
  const schema = await fs.readFile(path.join(__dirname, "schema.sql"), "utf-8");

  // @ts-expect-error
  const dbSchema = sql(schema);

  await Promise.all([
    db.executeQuery(dbSchema.compile(db)),
    kuttDb.executeQuery(kuttSchema.compile(kuttDb)),
  ]);

  await kuttDb
    .insertInto("links")
    .values([
      {
        target: kuttRepositoryTarget,
        address: kuttRepositoryAddress,
        expire_in: future,
      },
      {
        target: valienvRepositoryTarget,
        address: valienvRepositoryAddress,
        expire_in: past,
      },
    ])
    .executeTakeFirstOrThrow();

  const { app } = await import("../src/index");
  await app.ready();

  return async () => {
    await app.close();

    dbMock.destroy();
    kuttMock.destroy();
  };
}, timeout);

afterEach(async () => {
  const { db } = await import("../src/database/db");
  await db.deleteFrom("links").executeTakeFirstOrThrow();
}, timeout);

test.skip("correctly insert and get a link", { timeout }, async () => {
  const response = await fetch(new Request(serverUrl, { redirect: "manual" }));

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(env.FALLBACK_URL);

  // const { createLink, getLink } = await import("../src/database/db");

  // const { address } = await createLink({
  //   target: "https://swan.io",
  //   expired_at: addToNow("1h"),
  // });

  // const link = await getLink(address);
  // expect(link?.target).toBe("https://swan.io");
});

// test.skip("don't return an expired link", { timeout }, async () => {
//   const { createLink, getLink } = await import("../src/database/db");

//   const { address } = await createLink({
//     target: "https://swan.io",
//     expired_at: past,
//   });

//   const link = await getLink(address);
//   expect(link).toBeUndefined();
// });

// test("delete expired links", { timeout }, async () => {
//   const { createLink } = await import("../src/database/db");

//   await Promise.all([
//     createLink({
//       target: "https://swan.io",
//       expired_at: past,
//     }),
//     createLink({
//       target: "https://swan.io",
//       expired_at: future,
//     }),
//   ]);

//   const { numDeletedRows } = await deleteExpiredLinks();
//   expect(numDeletedRows).toBe(BigInt(1));
// });
