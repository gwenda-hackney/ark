/** Where reference images live and the limits that keep the clone small. */
import { fileURLToPath } from "node:url";

export const BRAND_DIR = fileURLToPath(new URL("../../docs/brand/", import.meta.url));
/** Long edge after resize. Enough for a brief or a mock-up; not print. */
export const MAX_EDGE = 1600;
/** Per file. Twenty files at this cap are still under 8MB in the clone. */
export const MAX_BYTES = 400 * 1024;
