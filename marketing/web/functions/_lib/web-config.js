/**
 * Non-secret web settings from the central Baserow config database
 * (Service = web). See docs/config.md.
 */
import { configEnvName, getConfigString } from "../../../../shared/config-db.js";
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

/**
 * Who gets a form's notification. Prod: the Sanity form's own address (an
 * env override still wins). Everywhere else the forms.notify_email setting
 * (alerts@ for every hosted non-prod site) or, on a developer's machine,
 * FORMS_NOTIFY_EMAIL is required: copied content carries real inboxes (play@), so without the
 * setting nothing is sent (the caller keeps the submission and logs why).
 */
export async function resolveFormNotifyTo(env, form) {
  if (configEnvName(env) !== "production") {
    // A developer's machine sets FORMS_NOTIFY_EMAIL (repo .env) to get form
    // emails in their own inbox. Hosted non-prod sites use the config row (alerts@).
    const developer = String(env.FORMS_NOTIFY_EMAIL || "").trim();
    if (developer) return developer;
    let override = "";
    try {
      override = (await getConfigString(env, "web", WEB_CONFIG_KEYS.formsNotifyEmail)).trim();
    } catch (error) {
      throw new Error(
        `Settings unavailable, so no form email outside prod (${error instanceof Error ? error.message : error}).`,
      );
    }
    if (!override) {
      throw new Error(
        `forms.notify_email is not set for ${configEnvName(env)}; not emailing the form's real inbox outside prod.`,
      );
    }
    return override;
  }
  const override = await webConfigString(env, WEB_CONFIG_KEYS.formsNotifyEmail);
  return override || form?.notifyEmail?.trim() || "";
}
