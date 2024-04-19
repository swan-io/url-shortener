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
import { db } from "./database/db";
import { generateAddress } from "./utils/address";
import { env } from "./utils/env";
import { parseDuration } from "./utils/time";

const app = fastify({
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

app.get<{ Params: { address: string } }>(
  "/:address",
  async (request, reply) => {
    const { address } = request.params;

    if (address.length !== 6) {
      return reply.notFound(); // TODO: redirect to fallback url
    }

    const result = await db
      .selectFrom("links")
      .select("target")
      .where("address", "=", address)
      .where(sql<boolean>`expired_at >= CURRENT_TIMESTAMP`)
      .executeTakeFirst();

    if (result == null) {
      return reply.notFound(); // TODO: redirect to fallback url
    }

    return reply.redirect(302, result.target);
  },
);

const LinksBody = Type.Object({
  target: Type.String({ format: "uri" }),
  expire_in: Type.Optional(Type.String()),
});

const LinksReply = Type.Object({
  address: Type.String(),
  target: Type.String({ format: "uri" }),
  expired_at: Type.String(),
});

const inOneWeek = dayjs.duration(1, "week");

app.post<{
  Body: Static<typeof LinksBody>;
  Reply: Static<typeof LinksReply>;
}>(
  "/api/links",
  {
    schema: {
      body: LinksBody,
      response: {
        200: LinksReply,
      },
    },
  },
  async (request, reply) => {
    const { target, expire_in } = request.body;
    const address = generateAddress();

    const expired_at = dayjs
      .utc()
      .add(parseDuration(expire_in) ?? inOneWeek)
      .toISOString();

    await db
      .insertInto("links")
      .values({ address, target, expired_at })
      .executeTakeFirstOrThrow();

    return reply.status(200).send({
      address,
      target,
      expired_at,
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
  (err, address) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }

    console.log(`server listening at ${address}`);
  },
);

app.ready().then(() => {
  app.scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { hours: 1 },
      new AsyncTask(
        "clean expired links",
        () =>
          db
            .deleteFrom("links")
            .where(sql<boolean>`expired_at < CURRENT_TIMESTAMP`)
            .executeTakeFirstOrThrow(),
        (err) => {
          app.log.error(err);
        },
      ),
    ),
  );
});
