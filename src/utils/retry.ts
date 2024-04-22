export const retry = <T>(
  getPromise: () => Promise<T>,
  { attempts = 2 }: { attempts?: number } = {},
): Promise<T> => {
  const safeAttempts = Math.max(attempts, 1);

  return getPromise().catch(async (error: unknown) =>
    safeAttempts === 1
      ? Promise.reject(error)
      : retry(getPromise, {
          attempts: safeAttempts - 1,
        }),
  );
};
