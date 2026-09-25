export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  label: string;
  tone: "unsaved" | "unpublished" | "preview" | "live" | "muted";
};

/**
 * One status for the event header, in plain words: saved, and on the website
 * or not. "Update website" puts it on gwenda.co.uk.
 */
export function eventHeaderFlag(
  publish: EventPublishState | null | undefined,
  dirty: boolean,
  { local = false, job = null }: { local?: boolean; job?: "waiting" | "failed" | null } = {},
): HeaderFlag {
  if (dirty) return { label: "Not saved", tone: "unsaved" };
  if (!publish) return { label: "New", tone: "muted" };
  // Saved; the calendar and website copy are still following in the background.
  if (job === "waiting") return { label: "Saved. Getting it ready…", tone: "muted" };
  if (job === "failed") return { label: "Saved, but not ready for the website", tone: "unpublished" };
  // Local ops is the developer's test copy: the preview is all it has.
  if (local) {
    return publish.preview === "current"
      ? { label: "Local preview", tone: "preview" }
      : { label: "Not in local preview", tone: "unpublished" };
  }
  // Hosted ops: editors only think about the website. The preview site is
  // updated on save behind the scenes and never named.
  if (publish.live === "current") return { label: "On the website", tone: "live" };
  if (publish.live === "unpublished") return { label: "Not on the website yet", tone: "unpublished" };
  return { label: "Website has an older version", tone: "preview" };
}
