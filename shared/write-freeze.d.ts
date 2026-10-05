/** Types for the TypeScript Workers; see write-freeze.js. */
export const FREEZABLE_FEATURES: Record<string, "ops" | "website">;
export const FREEZE_KEY_PREFIX: string;
export const FROZEN_MESSAGE: string;
export const FROZEN_STATUS: number;
export function frozenFeatures(env: unknown, features?: string[]): Promise<string[]>;
export function frozenWriteResponse(env: unknown, features: string[]): Promise<Response | null>;
export function isWriteRequest(request: { method: string }): boolean;
export function featuresForPath(pathname: string, table: [RegExp, string[]][]): string[];
