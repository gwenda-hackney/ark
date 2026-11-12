/**
 * What `npm run ops:dev` decides from its flags, and its check-in (#300):
 * while plain ops:dev runs, it tells hosted dev ops every minute that local
 * ops is running, so dev's automatic website updates wait instead of undoing
 * local changes with older code. The rules for reading it are the provider's
 * (ops/site/src/website/server/local-ops.js); this only writes and clears it.
 *
 * `--live` (npm run ops:prod) runs as production and never checks in:
 * production is never paused.
 */
import { randomUUID } from "node:crypto";
import {
  LOCAL_OPS_CHECK_IN_MS,
  LOCAL_OPS_FRESH_MS,
  checkIn as writeCheckIn,
  clearCheckIn,
} from "../../ops/site/src/website/server/local-ops.js";

/**
 * @param {string[]} argv process.argv
 * @returns {{ live: boolean, siteEnv: "production" | "local", checksIn: boolean }}
 */
export function opsDevMode(argv) {
  const live = argv.includes("--live");
  return { live, siteEnv: live ? "production" : "local", checksIn: !live };
}

/** How long stopping waits for the clear before ops-dev exits anyway. */
const CLEAR_WAIT_MS = 3000;

/**
 * Check in now and every `everyMs` while `mode` says to; `stop()` stops and
 * clears this session's check-in (waiting at most CLEAR_WAIT_MS). `env`: the
 * process env with the config credentials; it runs as SITE_ENV=local, a
 * developer's machine, which writes dev's row. A check-in that fails warns
 * once and never stops local ops.
 */
export function startCheckIns({
  mode,
  env,
  by,
  session = randomUUID(),
  everyMs = LOCAL_OPS_CHECK_IN_MS,
  checkIn = writeCheckIn,
  clear = clearCheckIn,
  warn = console.warn,
}) {
  if (!mode.checksIn) return { session, stop: async () => {} };
  const machine = { ...env, SITE_ENV: "local" };
  const since = Date.now();
  let warned = false;
  const once = () =>
    checkIn(machine, { session, since, by, now: Date.now() }).catch((error) => {
      if (warned) return;
      warned = true;
      warn(
        `[ops-dev] Could not tell dev ops that local ops is running (${error?.message || error}). ` +
          "Its automatic website updates may undo local changes until a check-in gets through.",
      );
    });
  void once();
  const timer = setInterval(() => void once(), everyMs);
  timer.unref?.();

  let stopping = null;
  return {
    session,
    stop() {
      stopping ??= (async () => {
        clearInterval(timer);
        let timeout;
        const gaveUp = new Promise((resolve) => {
          timeout = setTimeout(() => resolve("timeout"), CLEAR_WAIT_MS);
        });
        const outcome = await Promise.race([clear(machine, session).then(() => "cleared", (error) => error), gaveUp]);
        clearTimeout(timeout);
        if (outcome !== "cleared") {
          const why = outcome === "timeout" ? "it took too long" : outcome?.message || String(outcome);
          warn(
            `[ops-dev] Could not clear the check-in (${why}): dev's automatic website updates resume within ` +
              `${Math.round(LOCAL_OPS_FRESH_MS / 60_000)} minutes.`,
          );
        }
      })();
      return stopping;
    },
  };
}
