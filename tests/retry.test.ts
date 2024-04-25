import { expect, test } from "vitest";
import { retry } from "../src/utils/retry";

test("retry make 3 attempts if promise resolve with error", async () => {
  let attempts = 0;

  const result = retry(3, () => {
    return new Promise((_, reject) => {
      attempts++;
      reject(new Error("fail"));
    });
  });

  await expect(result).rejects.toStrictEqual(new Error("fail"));
  expect(attempts).toBe(3);
});

test("retry make only 1 attempt if maxAttemps is set to <= 1", async () => {
  let attempts = 0;

  const result = retry(-1, () => {
    return new Promise((_, reject) => {
      attempts++;
      reject(new Error("fail"));
    });
  });

  await expect(result).rejects.toStrictEqual(new Error("fail"));
  expect(attempts).toBe(1);
});

test("retry make only 1 attempt if future resolve with ok", async () => {
  let attempts = 0;

  const result = retry(3, () => {
    return new Promise((resolve) => {
      attempts++;
      resolve(null);
    });
  });

  await expect(result).resolves.toBeNull();
  expect(attempts).toBe(1);
});

test("retry make 2 attempts if future resolve with ok the second time", async () => {
  let attempts = 0;

  const result = retry(3, () => {
    return new Promise((resolve, reject) => {
      attempts++;
      attempts === 2 ? resolve(null) : reject(new Error("fail"));
    });
  });

  await expect(result).resolves.toBeNull();
  expect(attempts).toBe(2);
});
