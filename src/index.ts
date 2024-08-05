process.env.TZ = "UTC";

import "./tracing";

import schedule from "@fastify/schedule";
import sensible from "@fastify/sensible";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Static, Type } from "@sinclair/typebox";
import closeWithGrace from "close-with-grace";
import dayjs from "dayjs";
import fastify from "fastify";
import health from "fastify-healthcheck";
import { sql } from "kysely";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { db, kuttDb } from "./database/db";
import { generateAddress } from "./utils/address";
import { env } from "./utils/env";
import { retry } from "./utils/retry";
import { parseDuration } from "./utils/time";

export const app = fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers["X-API-Key"]', "req.url"],
    },
    ...(env.NODE_ENV === "development" && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    }),
  },
}).withTypeProvider<TypeBoxTypeProvider>();

app.register(sensible);
app.register(health, { healthcheckUrl: "/api/health" });
app.register(schedule);

// TODO: remove after migration
app.get("/api/v2/health", (_request, reply) => {
  return reply.status(200).send("OK");
});

app.get<{ Params: { address: string } }>(
  "/:address",
  async (request, reply) => {
    const { address } = request.params;

    const link = await db
      .updateTable("links")
      .set({ visited: true })
      .where("address", "=", address)
      .where("expired_at", ">=", sql<Date>`now()`)
      .returning("target")
      .executeTakeFirst();

    if (link != null) {
      return reply.redirect(link.target, 302);
    }

    const kuttLink = await kuttDb
      .selectFrom("links")
      .select("target")
      .where("address", "=", address)
      .where(({ eb, or }) =>
        or([
          eb("expire_in", "is", null),
          eb("expire_in", ">=", sql<Date>`now()`),
        ]),
      )
      .executeTakeFirst();

    return reply.redirect(kuttLink?.target ?? env.FALLBACK_URL, 302);
  },
);

const LinksBody = Type.Object({
  target: Type.String({ format: "uri" }),
  expire_in: Type.Optional(Type.String()),

  // TODO: remove this after iam migration
  domain: Type.Optional(Type.String({ format: "hostname" })),
});

const LinksReply = Type.Object({
  id: Type.String({ format: "uuid" }),
  address: Type.String(),
  target: Type.String({ format: "uri" }),
  visited: Type.Boolean(),
  expired_at: Type.String(),
  created_at: Type.String(),

  // TODO: remove this after iam migration
  link: Type.Optional(Type.String({ format: "uri" })),
});

export type LinksBody = Static<typeof LinksBody>;
export type LinksReply = Static<typeof LinksReply>;

const oneWeek = dayjs.duration(1, "week");

// TODO: remove /api/v2/links after migration
for (const path of ["/api/links", "/api/v2/links"]) {
  app.post<{
    Headers: { "X-API-Key"?: string };
    Body: LinksBody;
    Reply: LinksReply;
  }>(
    path,
    {
      schema: {
        body: LinksBody,
        response: {
          200: LinksReply,
        },
      },
    },
    async (request, reply) => {
      if (request.headers["x-api-key"] !== env.API_KEY) {
        return reply.unauthorized();
      }

      const { domain, target, expire_in } = request.body;

      const expired_at = dayjs()
        .add(parseDuration(expire_in) ?? oneWeek)
        .toISOString();

      const link = await retry(2, () =>
        db
          .insertInto("links")
          .values({
            address: generateAddress(),
            target,
            expired_at,
          })
          .returning([
            "id",
            "address",
            "target",
            "visited",
            "expired_at",
            "created_at",
          ])
          .executeTakeFirstOrThrow(),
      );

      return reply.status(200).send({
        ...link,

        expired_at: link.expired_at.toISOString(),
        created_at: link.created_at.toISOString(),

        // TODO: remove this after iam migration
        ...(domain != null && {
          link: `https://${domain}/${link.address}`,
        }),
      });
    },
  );
}

// delay is the number of ms for the graceful close to finish
const closeListeners = closeWithGrace({ delay: 500 }, ({ err }) => {
  if (err) {
    app.log.error(err);
  }

  return app.close();
});

app.addHook("onClose", async () => {
  closeListeners.uninstall();
});

app.listen(
  {
    port: env.SERVER_PORT,
    host: "0.0.0.0",
  },
  (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
  },
);

export const cleanExpiredLinks = () =>
  db
    .deleteFrom("links")
    .where("expired_at", "<", sql<Date>`now()`)
    .executeTakeFirstOrThrow();

app.ready().then(async () => {
  try {
    await db.selectFrom("links").select("address").executeTakeFirst();
    app.log.info("Connected to service database");

    await kuttDb.selectFrom("links").select("address").executeTakeFirst();
    app.log.info("Connected to kutt database");

    const taskId = "clean_expired_links";

    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        {
          days: 1,
          runImmediately: true,
        },
        new AsyncTask(taskId, cleanExpiredLinks, (err) => {
          app.log.error(err);
        }),
        {
          id: taskId,
          preventOverrun: true,
        },
      ),
    );
  } catch (error) {
    app.log.error(error);
    await app.close();
  }
});
