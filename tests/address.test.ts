import { expect, test } from "vitest";
import { generateAddress } from "../src/utils/address";

const regExp = /[0-9a-z]/i;

test(
  "generated addresses are 6 alphanumeric characters",
  { repeats: 1000 },
  async () => {
    const address = generateAddress();
    expect(address).toMatch(regExp);
    expect(address).toHaveLength(6);
  },
);
