/**
 * Look-aside cache for local Secrets Manager values.
 *
 * Lives in RAM (`/dev/shm`), never in the repo, so it is gone when the
 * container stops. Each entry is tied to the credential that fetched it (a hash
 * of the Bitwarden session, or of ARK_LOCAL_BW_TOKEN when set in the shell):
 * after `bw-lock` or a new unlock the old entry no longer matches and is
 * refetched. Anything that writes to SM clears it.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SECRETS_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export function secretsCacheDir() {
  const override = process.env.ARK_SECRETS_CACHE_DIR?.trim();
  if (override) return override;
  const base = existsSync("/dev/shm") ? "/dev/shm" : tmpdir();
  return join(base, `ark-secrets-${process.getuid?.() ?? "user"}`);
}

function hashBinding(binding) {
  return createHash("sha256").update(binding).digest("hex");
}

/** Our own private directory, or null (someone else made it, or it is open). */
function privateDir({ create }) {
  const dir = secretsCacheDir();
  if (create) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!existsSync(dir)) return null;
  const stat = statSync(dir);
  const uid = process.getuid?.();
  if (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid) || stat.mode & 0o077) {
    return null;
  }
  return dir;
}

/** @returns {Map<string, string> | null} */
export function readSecretsCache(env, binding) {
  try {
    const dir = privateDir({ create: false });
    if (!dir || !binding) return null;
    const entry = JSON.parse(readFileSync(join(dir, `${env}.json`), "utf8"));
    if (entry.binding !== hashBinding(binding)) return null;
    if (Date.now() - entry.fetchedAt > SECRETS_CACHE_TTL_MS) return null;
    return new Map(Object.entries(entry.values));
  } catch {
    return null;
  }
}

export function writeSecretsCache(env, binding, values) {
  try {
    const dir = privateDir({ create: true });
    if (!dir || !binding) return;
    const path = join(dir, `${env}.json`);
    const entry = {
      binding: hashBinding(binding),
      fetchedAt: Date.now(),
      values: Object.fromEntries(values),
    };
    writeFileSync(`${path}.tmp`, JSON.stringify(entry), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  } catch {
    // The cache is only a speed-up; the next run fetches again.
  }
}

/**
 * Write a dotenv file of runtime bindings into the private RAM directory, for
 * `wrangler dev --env-file`. The caller deletes it when its child exits.
 * @param {string} name file name, e.g. "ops-dev.env"
 * @param {Map<string, string>} values
 * @returns {string} path
 */
export function writeRuntimeEnvFile(name, values) {
  const dir = privateDir({ create: true });
  if (!dir) throw new Error(`${secretsCacheDir()} is not a private directory; not writing secrets there.`);
  const path = join(dir, name);
  const lines = [...values].map(([key, value]) => `${key}=${value}`);
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
  return path;
}

/** Drop cached SM values (not the env files of running dev servers). */
export function clearSecretsCache() {
  const dir = privateDir({ create: false });
  if (!dir) return;
  // local.json: the name before dev and local became one env.
  for (const env of ["dev", "local"]) rmSync(join(dir, `${env}.json`), { force: true });
}
