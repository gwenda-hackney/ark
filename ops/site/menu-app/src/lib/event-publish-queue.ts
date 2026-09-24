export type PublishWorkEvent = {
	id: string;
	name: string;
	publish: {
		preview: "unpublished" | "stale" | "current";
		live: "unpublished" | "stale" | "current";
		previewDates?: string[];
	};
};

export function eventsNeedingPreview<T extends PublishWorkEvent>(events: T[]): T[] {
	return events.filter((event) => event.publish.preview !== "current");
}

export function eventsNeedingLive<T extends PublishWorkEvent>(events: T[]): T[] {
	return events.filter(
		(event) => event.publish.preview === "current" && event.publish.live !== "current",
	);
}

export function publishWorkNights(events: PublishWorkEvent[]): number {
	return events.reduce((sum, event) => sum + (event.publish.previewDates?.length || 0), 0);
}

export function seriesCount(count: number): string {
	return count === 1 ? "1 series" : `${count} series`;
}

function seriesAndNights(events: PublishWorkEvent[]): string {
	const series = seriesCount(events.length);
	const nights = publishWorkNights(events);
	if (!nights) return series;
	const nightLabel = nights === 1 ? "1 night" : `${nights} nights`;
	return `${series}, ${nightLabel}`;
}

/** Header button: the step that still has work, with a count. */
export function bulkPublishButtonLabel(events: PublishWorkEvent[]): string {
	const preview = eventsNeedingPreview(events).length;
	if (preview) return `Update preview (${preview})`;
	const live = eventsNeedingLive(events).length;
	if (live) return `Push live (${live})`;
	return "Publish";
}

export function bulkPublishLead(events: PublishWorkEvent[]): string {
	if (!events.length) return "There are no series to publish.";
	if (eventsNeedingPreview(events).length) {
		return "Step 1 of 3. Update the preview, then check staging.";
	}
	if (eventsNeedingLive(events).length) {
		return "Staging is current. Open What's on, then push live.";
	}
	return "Every series is live.";
}

export function previewWorkCopy(events: PublishWorkEvent[]): string {
	const pending = eventsNeedingPreview(events);
	if (!pending.length) return "The staging diary already has every series.";
	return `${seriesAndNights(pending)} to write into the staging diary.`;
}

export function liveWorkCopy(events: PublishWorkEvent[]): string {
	if (eventsNeedingPreview(events).length) return "Unlocks after every preview is current.";
	const pending = eventsNeedingLive(events);
	if (!pending.length) return "Live on gwenda.co.uk.";
	return `${seriesAndNights(pending)} to copy onto the live site.`;
}

export function bulkPublishProgress(
	target: "staging" | "production",
	index: number,
	total: number,
	name: string,
): string {
	const action = target === "production" ? "Pushing live" : "Updating preview";
	return `${action}: ${name}. ${index} of ${total}.`;
}
