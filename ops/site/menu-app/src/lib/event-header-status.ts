export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  label: string;
  tone: "unsaved" | "unpublished" | "preview" | "live" | "muted";
};

/**
 * One status for the event header. Saving stages, so "Not staged" only shows
 * when staging failed (for example, no description yet). Local ops stages
 * drafts that only the local site shows.
 */
export function eventHeaderFlag(
  publish: EventPublishState | null | undefined,
  dirty: boolean,
  { local = false }: { local?: boolean } = {},
): HeaderFlag {
  if (dirty) return { label: "Unsaved changes", tone: "unsaved" };
  if (!publish) return { label: "Not saved", tone: "muted" };
  if (publish.preview !== "current") return { label: "Not staged", tone: "unpublished" };
  if (local) return { label: "Local preview", tone: "preview" };
  if (publish.live === "current") return { label: "Live", tone: "live" };
  return { label: "Staged · not live", tone: "preview" };
}
