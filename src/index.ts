import "./tracing";

import schedule from "@fastify/schedule";
import sensible from "@fastify/sensible";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Static, Type } from "@sinclair/typebox";
import closeWithGrace from "close-with-grace";
import fastify from "fastify";
import health from "fastify-healthcheck";
import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { createLink, deleteExpiredLinks, getLink } from "./database/db";
import { getKuttLink } from "./database/kuttDb";
import { env } from "./utils/env";
import { retry } from "./utils/retry";
import { addToNow } from "./utils/time";

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

// TODO: remove this once migration is done
app.get("/api/v2/health", (_request, reply) => {
  return reply.status(200).send("OK");
});

app.get<{ Params: { address: string } }>(
  "/:address",
  async (request, reply) => {
    const { address } = request.params;
    const link = await getLink(address);

    if (link != null) {
      return reply.redirect(302, link.target);
    }

    // TODO: remove this once migration is done
    const kuttLink = await getKuttLink(address);
    return reply.redirect(302, kuttLink?.target ?? env.FALLBACK_URL);
  },
);

const LinksBody = Type.Object({
  domain: Type.Optional(Type.String({ format: "hostname" })),
  target: Type.String({ format: "uri" }),
  expire_in: Type.Optional(Type.String()),
});

const LinksReply = Type.Object({
  link: Type.Optional(Type.String({ format: "uri" })),
  address: Type.String(),
  expired_at: Type.String(),
});

// TODO: remove /api/v2/links once migration is done
for (const path of ["/api/links", "/api/v2/links"]) {
  app.post<{
    Headers: { "X-API-Key"?: string };
    Body: Static<typeof LinksBody>;
    Reply: Static<typeof LinksReply>;
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
      const { domain, target, expire_in } = request.body;

      if (request.headers["x-api-key"] !== env.API_KEY) {
        return reply.forbidden();
      }

      const expired_at = addToNow(expire_in);

      const { address } = await retry(2, () =>
        createLink({
          target,
          expired_at,
        }),
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

app.ready().then(() => {
  app.scheduler.addSimpleIntervalJob(
    new SimpleIntervalJob(
      { hours: 1 },
      new AsyncTask(
        "delete expired links",
        () => deleteExpiredLinks(),
        (err) => {
          app.log.error(err);
        },
      ),
    ),
  );
});
