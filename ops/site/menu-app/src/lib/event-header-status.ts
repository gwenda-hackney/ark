export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  label: string;
  tone: "unsaved" | "unpublished" | "preview" | "live" | "muted" | "new";
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
  if (dirty) return { label: "Not saved", tone: "unsaved" };
  if (!publish) return { label: "New", tone: "new" };
  // Saved; the calendar and website copy are still following in the background.
  if (job === "waiting") return { label: "Saved. Getting it ready…", tone: "muted" };
  if (job === "failed") return { label: "Saved, but not ready for the website", tone: "unpublished" };
  // Editors only think about the website. The preview site is updated on
  // save behind the scenes and never named. Local ops works the same way.
  if (publish.live === "current") return { label: "On the website", tone: "live" };
  if (publish.live === "unpublished") return { label: "Not on the website yet", tone: "unpublished" };
  return { label: "Website has an older version", tone: "preview" };
}
