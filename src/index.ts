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
import metrics from "fastify-metrics";
import { sql } from "kysely";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { db } from "./database/db";
import { auth } from "./plugins/auth";
import { generateAddress } from "./utils/address";
import { env } from "./utils/env";
import { retry } from "./utils/retry";
import { parseDuration } from "./utils/time";

export const app = fastify({
  logger: {
    level: env.LOG_LEVEL,
    redact: {
      paths: ['req.headers["x-api-key"]'],
    },
    serializers: {
      req: (request) => {
        const { url } = request;

        return {
          method: request.method,
          url: url === "/api" || url.startsWith("/api/") ? url : "[Redacted]",
          hostname: request.hostname,
          remoteAddress: request.ip,
          remotePort: request.socket ? request.socket.remotePort : undefined,
        };
      },
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
app.register(auth);
app.register(schedule);

const debugOnlyLogLevel = env.LOG_LEVEL === "debug" ? "debug" : "silent";

app.register(health, {
  healthcheckUrl: "/api/health",
  logLevel: debugOnlyLogLevel,
});
app.register(metrics, {
  endpoint: "/api/metrics",
  logLevel: debugOnlyLogLevel,
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

    return reply.redirect(link?.target ?? env.FALLBACK_URL, 302);
  },
);

const Link = Type.Object({
  id: Type.String({ format: "uuid" }),
  address: Type.String(),
  target: Type.String({ format: "uri" }),
  visited: Type.Boolean(),
  expired_at: Type.String(),
  created_at: Type.String(),

  // TODO: remove this after iam migration
  link: Type.Optional(Type.String({ format: "uri" })),
});

export type Link = Static<typeof Link>;

const oneWeek = dayjs.duration(1, "week");

app.post(
  "/api/links",
  {
    schema: {
      body: Type.Object({
        address: Type.Optional(Type.String()),
        expire_in: Type.Optional(Type.String()),
        target: Type.String({ format: "uri" }),

        // TODO: remove this after iam migration
        domain: Type.Optional(Type.String({ format: "hostname" })),
      }),
      response: {
        200: Link,
      },
    },
  },
  async (request, reply) => {
    const {
      address = generateAddress(),
      domain,
      expire_in,
      target,
    } = request.body;

    const expired_at = dayjs()
      .add(parseDuration(expire_in) ?? oneWeek)
      .toISOString();

    const link = await retry(2, () =>
      db
        .insertInto("links")
        .values({ address, target, expired_at })
        .returningAll()
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

app.get(
  "/api/links/:id",
  {
    schema: {
      params: Type.Object({
        id: Type.String({ format: "uuid" }),
      }),
      response: {
        200: Link,
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;

    const link = await db
      .selectFrom("links")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (link == null) {
      return reply.notFound();
    }

    return reply.status(200).send({
      ...link,

      expired_at: link.expired_at.toISOString(),
      created_at: link.created_at.toISOString(),
    });
  },
);

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
