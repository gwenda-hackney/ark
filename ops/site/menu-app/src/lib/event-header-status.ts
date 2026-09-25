export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  label: string;
  tone: "unsaved" | "unpublished" | "preview" | "live" | "muted";
};

/**
 * One status for the event header, in plain words. Saving puts the event on
 * the preview site; "Put on website" puts it on gwenda.co.uk. Local ops only
 * ever shows a local preview.
 */
export function eventHeaderFlag(
  publish: EventPublishState | null | undefined,
  dirty: boolean,
  { local = false }: { local?: boolean } = {},
): HeaderFlag {
  if (dirty) return { label: "Not saved", tone: "unsaved" };
  if (!publish) return { label: "New", tone: "muted" };
  if (publish.preview !== "current") return { label: "Not on the preview site", tone: "unpublished" };
  if (local) return { label: "Local preview", tone: "preview" };
  if (publish.live === "current") return { label: "On the website", tone: "live" };
  if (publish.live === "unpublished") return { label: "Not on the website yet", tone: "preview" };
  return { label: "Website has an older version", tone: "preview" };
}
