export const retry = <T>(
  maxAttempts: number,
  getPromise: () => Promise<T>,
): Promise<T> =>
  getPromise().catch((error) =>
    maxAttempts > 1
      ? retry(maxAttempts - 1, getPromise)
      : Promise.reject(error),
  );
