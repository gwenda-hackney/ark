/** Types for the TypeScript Workers; see data-store.js. */
export const STORE_FEATURES: Record<string, "ops" | "website" | "config">;
export const STORE_KEY_PREFIX: string;
export const STORES: string[];
export function storeOf(
  env: unknown,
  feature: string,
): Promise<"baserow" | "d1">;
export function switchedRepository<T>(
  env: unknown,
  feature: string,
  adapters: Record<"baserow" | "d1", (env: any) => T>,
): T;
