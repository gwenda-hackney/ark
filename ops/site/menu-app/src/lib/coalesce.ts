/** Share one in-flight promise per key so HMR remounts do not burst the API. */
export function createCoalescer() {
  const inflight = new Map<string, Promise<unknown>>();
  return function coalesce<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = run().finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
  };
}
