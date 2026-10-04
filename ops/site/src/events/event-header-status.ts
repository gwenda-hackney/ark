import type { BadgeTone } from "../ui/badge";

export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  /** One or two words for the badge. */
  label: string;
  /** The longer explanation, for the badge's tooltip. */
  title: string;
  tone: BadgeTone;
  /** On the website and current: the badge can link to the page. */
  live: boolean;
};

/**
 * One status for the event header, in plain words: saved, and on the website
 * or not. "Update website" puts it on gwenda.co.uk.
 */
export function eventHeaderFlag(
  publish: EventPublishState | null | undefined,
  dirty: boolean,
  { job = null }: { job?: "waiting" | "failed" | null } = {},
): HeaderFlag {
  const flag = (label: string, title: string, tone: BadgeTone, live = false) => ({ label, title, tone, live });
  if (dirty) return flag("Not saved", "You have changes that are not saved", "danger");
  if (!publish) return flag("New", "Not saved yet", "neutral");
  // Saved; the calendar and website copy are still following in the background.
  if (job === "waiting") return flag("Updating", "Saved. Getting it ready for the website…", "neutral");
  if (job === "failed") return flag("Failed", "Saved, but not ready for the website", "danger");
  // Editors only think about the website. The preview site is updated on
  // save behind the scenes and never named. Local ops works the same way.
  if (publish.live === "current") return flag("Live", "On the website", "success", true);
  if (publish.live === "unpublished") return flag("Not live", "Not on the website yet", "neutral");
  return flag("Changed", "Changes not on the website yet. Update website puts them there.", "warning");
}
