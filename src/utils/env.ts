import dotenv from "dotenv";
import path from "node:path";
import { number, oneOf, string, url, validate } from "valienv";

dotenv.config({
  path: path.join(process.cwd(), ".env"),
});

export const env = validate({
  env: process.env,
  validators: {
    DATABASE_URL: string,
    FALLBACK_URL: url,
    LOG_LEVEL: oneOf("debug", "info", "warn", "error", "fatal"),
    NODE_ENV: oneOf("development", "test", "production"),
    SERVER_PORT: number,
  },
});
