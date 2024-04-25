import crypto from "node:crypto";

const regExp = /[^0-9A-Z]/gi;

export const generateAddress = () =>
  crypto
    .randomBytes(32)
    .toString("base64url")
    .replace(regExp, "")
    .padEnd(6, "0")
    .substring(0, 6);
