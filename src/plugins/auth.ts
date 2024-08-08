import fp from "fastify-plugin";
import { env } from "../utils/env";

export const auth = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const { url } = request;

    if (url === "/api" || (url.startsWith("/api/") && url !== "/api/health")) {
      if (request.headers["x-api-key"] !== env.API_KEY) {
        return reply.unauthorized();
      }
    }
  });
});
