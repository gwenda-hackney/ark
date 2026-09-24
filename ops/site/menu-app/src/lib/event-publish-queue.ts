export type PublishWorkEvent = {
  id: string;
  name: string;
  publish: {
    preview: "unpublished" | "stale" | "current" | string;
    live: "unpublished" | "stale" | "current" | string;
    previewDates?: string[];
  };
};

/** Saved but not on staging: staging failed or the event predates save-stages. */
export function eventsNotStaged<T extends PublishWorkEvent>(events: T[]): T[] {
  return events.filter((event) => event.publish.preview !== "current");
}

/** On staging and waiting for Website > Release. */
export function eventsAwaitingRelease<T extends PublishWorkEvent>(events: T[]): T[] {
  return events.filter(
    (event) => event.publish.preview === "current" && event.publish.live !== "current",
  );
}

export function seriesCount(count: number): string {
  return count === 1 ? "1 series" : `${count} series`;
}
