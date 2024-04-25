import dayjs from "dayjs";
import { sql } from "kysely";
import fs from "node:fs/promises";
import path from "node:path";
import { PostgresMock } from "pgmock";
import { afterEach, beforeAll, expect, test } from "vitest";
import { generateAddress } from "../src/utils/address";
import { env } from "../src/utils/env";

const serverUrl = `http://0.0.0.0:${env.SERVER_PORT}`;
const timeout = 30000;

const addressRegExp = /^[0-9A-Z]{6,}$/i;
const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const past = dayjs("01/01/1970").toISOString();
const future = dayjs("01/01/2070").toISOString();

const boxedRepositoryTarget = "https://github.com/@swan-io/boxed";
const chicaneRepositoryTarget = "https://github.com/@swan-io/chicane";
const kuttRepositoryTarget = "https://github.com/thedevs-network/kutt";
const valienvRepositoryTarget = "https://github.com/zoontek/valienv";

const kuttRepositoryAddress = generateAddress();
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
        address: kuttRepositoryAddress,
        target: kuttRepositoryTarget,
        expire_in: future,
      },
      {
        address: valienvRepositoryAddress,
        target: valienvRepositoryTarget,
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

test("correctly create a link without domain", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.API_KEY,
    },
    body: JSON.stringify({
      target: chicaneRepositoryTarget,
    }),
  });

  expect(response.status).toBe(200);

  // biome-ignore lint/suspicious/noExplicitAny:
  const json: any = await response.json();

  expect(json).toHaveProperty("address");
  expect(json).toHaveProperty("expired_at");
  expect(json).not.toHaveProperty("link");

  expect(json.address).toMatch(addressRegExp);
  expect(json.expired_at).toMatch(isoDateRegExp);

  const redirect = await fetch(`${serverUrl}/${json.address}`, {
    redirect: "manual",
  });

  expect(redirect.status).toBe(302);
  expect(redirect.headers.get("location")).toBe(chicaneRepositoryTarget);
});

test("correctly create a link with domain", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.API_KEY,
    },
    body: JSON.stringify({
      target: chicaneRepositoryTarget,
      domain: "swan.io",
    }),
  });

  expect(response.status).toBe(200);

  // biome-ignore lint/suspicious/noExplicitAny:
  const json: any = await response.json();

  expect(json).toHaveProperty("address");
  expect(json).toHaveProperty("expired_at");
  expect(json).toHaveProperty("link");

  const url = new URL(json.link);

  expect(url.hostname).toBe("swan.io");
  expect(url.pathname.substring(1)).toMatch(addressRegExp);
});

test("returns unauthorized if no api key provided", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/api/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target: chicaneRepositoryTarget,
    }),
  });

  expect(response.status).toBe(401);

  // biome-ignore lint/suspicious/noExplicitAny:
  const json: any = await response.json();

  expect(json).toStrictEqual({
    statusCode: 401,
    error: "Unauthorized",
    message: "Unauthorized",
  });
});

test("redirect to fallback url when no target found", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/unknown`, {
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(env.FALLBACK_URL);
});

test("return a target from kutt database when found", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/${kuttRepositoryAddress}`, {
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(kuttRepositoryTarget);
});

test("don't return an expired link", { timeout }, async () => {
  const { db } = await import("../src/database/db");

  const { address } = await db
    .insertInto("links")
    .values({
      target: chicaneRepositoryTarget,
      address: generateAddress(),
      expired_at: past,
    })
    .returning("address")
    .executeTakeFirstOrThrow();

  const response = await fetch(`${serverUrl}/${address}`, {
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(env.FALLBACK_URL);
});

test("don't return a kutt expired link", { timeout }, async () => {
  const response = await fetch(`${serverUrl}/${valienvRepositoryAddress}`, {
    redirect: "manual",
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(env.FALLBACK_URL);
});

test("clean expired links", { timeout }, async () => {
  const { cleanExpiredLinks } = await import("../src");
  const { db } = await import("../src/database/db");

  await db
    .insertInto("links")
    .values([
      {
        address: generateAddress(),
        target: boxedRepositoryTarget,
        expired_at: past,
      },
      {
        address: generateAddress(),
        target: chicaneRepositoryTarget,
        expired_at: future,
      },
    ])
    .returning("address")
    .executeTakeFirstOrThrow();

  const { numDeletedRows } = await cleanExpiredLinks();
  expect(numDeletedRows).toBe(BigInt(1));
});
