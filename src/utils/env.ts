import dotenv from "dotenv";
import path from "node:path";
import { number, oneOf, string, url, validate } from "valienv";

dotenv.config({
  path: path.join(process.cwd(), ".env"),
});

export const env = validate({
  env: process.env,
  validators: {
    NODE_ENV: oneOf("development", "test", "production"),
    LOG_LEVEL: oneOf("silent", "debug", "info", "warn", "error", "fatal"),
    API_KEY: string,
    DATABASE_URL: string,
    FALLBACK_URL: url,
    SERVER_PORT: number,

    // TODO: remove after migration
    KUTT_DATABASE_URL: string,
  },
  overrides: {
    ...(process.env.NODE_ENV === "test" && {
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgresql://postgres:pgmock@localhost:25432",
      // TODO: remove after migration
      KUTT_DATABASE_URL: "postgresql://postgres:pgmock@localhost:35432",
    }),
  },
});
