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
      paths: ['req.headers["X-API-Key"]'],
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
      .selectFrom("links")
      .select("target")
      .where("address", "=", address)
      .where("expired_at", ">=", sql<Date>`now()`)
      .executeTakeFirst();

    if (link != null) {
      return reply.redirect(302, link.target);
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

    return reply.redirect(302, kuttLink?.target ?? env.FALLBACK_URL);
  },
);

const LinksBody = Type.Object({
  domain: Type.Optional(Type.String({ format: "hostname" })),
  target: Type.String({ format: "uri" }),
  expire_in: Type.Optional(Type.String()),
});

const LinksReply = Type.Object({
  address: Type.String(),
  expired_at: Type.String(),
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

      const expired_at = dayjs
        .utc()
        .add(parseDuration(expire_in) ?? oneWeek)
        .toISOString();

      const { address } = await retry(2, () =>
        db
          .insertInto("links")
          .values({
            address: generateAddress(),
            target,
            expired_at,
          })
          .returning("address")
          .executeTakeFirstOrThrow(),
      );

      return reply.status(200).send({
        address,
        expired_at,
        ...(domain != null && {
          link: `https://${domain}/${address}`,
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

app
  .ready()
  .then(async () => {
    await db.selectFrom("links").select("id").executeTakeFirst();
    app.log.info("Connected to service database");

    await kuttDb.selectFrom("links").select("id").executeTakeFirst();
    app.log.info("Connected to kutt database");
  })
  .then(() => {
    app.scheduler.addSimpleIntervalJob(
      new SimpleIntervalJob(
        { hours: 1 },
        new AsyncTask(
          "clean expired links",
          () => cleanExpiredLinks(),
          (err) => {
            app.log.error(err);
          },
        ),
      ),
    );
  });
