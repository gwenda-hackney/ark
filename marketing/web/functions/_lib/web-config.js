/**
 * Non-secret web settings from the central Baserow config database
 * (Service = web). See docs/config.md.
 */
import { getConfigString } from "../../../../shared/config-db.js";
import { log } from "./log.js";

export const WEB_CONFIG_KEYS = {
  formsNotifyEmail: "forms.notify_email",
};

/**
 * Config value for this env, or "" when unset or the config DB is unreachable.
 * Mail must still go out if config is down, so errors are logged, not thrown.
 */
export async function webConfigString(env, key) {
  try {
    return (await getConfigString(env, "web", key)).trim();
  } catch (error) {
    log.event("error", "web_config_failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

/** Env override (e.g. dev inbox) wins over the Sanity form's notify address. */
export async function resolveFormNotifyTo(env, form) {
  const override = await webConfigString(env, WEB_CONFIG_KEYS.formsNotifyEmail);
  return override || form?.notifyEmail?.trim() || "";
}
