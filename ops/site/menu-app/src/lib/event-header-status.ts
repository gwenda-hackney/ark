export type EventPublishState = {
  preview: "unpublished" | "stale" | "current" | string;
  live: "unpublished" | "stale" | "current" | string;
};

export type HeaderFlag = {
  label: string;
  tone: "unsaved" | "unpublished" | "preview" | "live" | "muted";
};

/** Header state for an event. Unsaved wins, then anything not yet on preview. */
export function eventHeaderFlag(
  publish: EventPublishState | null | undefined,
  dirty: boolean,
): HeaderFlag {
  if (!publish) {
    return dirty
      ? { label: "Unsaved changes", tone: "unsaved" }
      : { label: "Not saved", tone: "muted" };
  }
  if (dirty) return { label: "Unsaved changes", tone: "unsaved" };
  if (publish.preview !== "current") {
    return { label: "Unpublished changes", tone: "unpublished" };
  }
  if (publish.live === "current") return { label: "Live", tone: "live" };
  return { label: "On preview", tone: "preview" };
}
