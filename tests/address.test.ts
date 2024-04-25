import { expect, test } from "vitest";
import { generateAddress } from "../src/utils/address";

const addressRegExp = /^[0-9A-Z]{6,}$/i;

test(
  "generated addresses are 6 alphanumeric characters",
  { repeats: 1000 },
  async () => {
    const address = generateAddress();
    expect(address).toHaveLength(6);
    expect(address).toMatch(addressRegExp);
  },
);
