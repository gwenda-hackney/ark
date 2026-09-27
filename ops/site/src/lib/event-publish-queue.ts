export type PublishWorkEvent = {
  id: string;
  name: string;
  publish: {
    preview: "unpublished" | "stale" | "current" | string;
    live: "unpublished" | "stale" | "current" | string;
    previewDates?: string[];
  };
};

/** Saved but not on the preview: that failed, or the event predates save-stages. */
export function eventsNotStaged<T extends PublishWorkEvent>(events: T[]): T[] {
  return events.filter((event) => event.publish.preview !== "current");
}

/** On the preview and waiting to be published from Website > Preview → live. */
export function eventsAwaitingRelease<T extends PublishWorkEvent>(events: T[]): T[] {
  return events.filter(
    (event) => event.publish.preview === "current" && event.publish.live !== "current",
  );
}

export function seriesCount(count: number): string {
  return count === 1 ? "1 series" : `${count} series`;
}
