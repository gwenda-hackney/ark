/**
 * Non-secret web settings from the central Baserow config database
 * (Service = web). See docs/config.md.
 */
import { environmentOf, getSetting, getSettingOrEmpty } from "../../../../shared/config.js";
import { log } from "./log.js";

export const WEB_CONFIG_KEYS = {
  formsNotifyEmail: "forms.notify_email",
};

/**
 * Web setting for this runtime, or "" when unset or the config DB is
 * unreachable (logged). Prod mail must still go out if config is down.
 */
export async function webConfigString(env, key) {
  try {
    return await getSettingOrEmpty(env, "web", key);
  } catch (error) {
    log.event("error", "web_config_failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

/**
 * Who gets a form's notification. Prod: the Sanity form's own address (a
 * setting still wins). Everywhere else the forms.notify_email setting is
 * required (alerts@ on every hosted non-prod site; on a developer's machine,
 * FORMS_NOTIFY_EMAIL from .env). Copied content carries real inboxes (play@),
 * so without it nothing is sent (the caller keeps the submission and logs why).
 */
export async function resolveFormNotifyTo(env, form) {
  if (environmentOf(env) !== "production") {
    let to = "";
    try {
      to = await getSetting(env, "web", WEB_CONFIG_KEYS.formsNotifyEmail);
    } catch (error) {
      throw new Error(
        `No form email outside prod: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (!to) {
      throw new Error(
        `forms.notify_email is not set for ${environmentOf(env)}; not emailing the form's real inbox outside prod.`,
      );
    }
    return to;
  }
  const override = await webConfigString(env, WEB_CONFIG_KEYS.formsNotifyEmail);
  return override || form?.notifyEmail?.trim() || "";
}
