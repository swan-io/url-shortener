import fp from "fastify-plugin";
import { env } from "../utils/env";

export const auth = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    // TODO: remove /api/v2/health after migration
    if (
      request.url.startsWith("/api/") &&
      request.url !== "/api/health" &&
      request.url !== "/api/v2/health"
    ) {
      if (request.headers["x-api-key"] !== env.API_KEY) {
        return reply.unauthorized();
      }
    }
  });
});
