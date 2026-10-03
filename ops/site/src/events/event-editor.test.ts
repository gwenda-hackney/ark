import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";
import type { OpsEvent, OpsEventOccurrence } from "../app/api";

const api = vi.hoisted(() => ({
	getEvents: vi.fn(),
	createEvent: vi.fn(),
	updateEvent: vi.fn(),
	ensureEventOccurrence: vi.fn(),
	updateEventOccurrence: vi.fn(),
	deleteEvent: vi.fn(),
	deleteEventOccurrence: vi.fn(),
	syncEventCalendar: vi.fn(),
	putEventOnWebsite: vi.fn(),
	uploadEventImage: vi.fn(),
	uploadEventOccurrenceImage: vi.fn(),
	clearEventImage: vi.fn(),
	clearEventOccurrenceImage: vi.fn(),
	getEventDrive: vi.fn(),
	uploadEventDriveImage: vi.fn(),
}));
const nav = vi.hoisted(() => ({ navigate: vi.fn(), leaveEditor: vi.fn() }));
const jobs = vi.hoisted(() => ({ queueWebsiteJob: vi.fn() }));
const toast = vi.hoisted(() => ({ ok: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("../app/api", () => api);
vi.mock("../app/nav", async (original) => ({ ...(await original<object>()), ...nav }));
vi.mock("../ui/toast.svelte", () => ({ toast }));
vi.mock("../ui/unsaved.svelte", () => ({ beginLeave: vi.fn() }));
vi.mock("../website/site-pending.svelte", () => ({ refreshSitePending: vi.fn() }));
vi.mock("./website-jobs.svelte", () => ({
	queueWebsiteJob: jobs.queueWebsiteJob,
	retryWebsiteJob: vi.fn(),
	websiteJobFor: () => null,
	websiteJobSettled: vi.fn(),
}));

const { EventEditor } = await import("./event-editor.svelte");

function night(date: string): OpsEventOccurrence {
	return {
		id: `n-${date}`,
		date,
		slug: `jazz-${date}`,
		sanityId: "",
		clickupTaskId: "",
		isSpecialEdition: false,
		overrides: {
			name: "",
			artist: "",
			offer: "",
			pageUrl: "",
			description: "",
			shortDescription: "",
			time: "",
			startTime: "",
			endTime: "",
			nightSchedule: null,
			operationsNotes: "",
			imageLinks: [],
			image: null,
			heroCrops: null,
		},
	};
}

function series(fields: Partial<OpsEvent> = {}): OpsEvent {
	return {
		id: "ev1",
		name: "Jazz Night",
		artist: "",
		offer: "",
		pageUrl: "",
		description: "Live jazz every week.",
		shortDescription: "",
		nightSchedule: [],
		operationsNotes: "",
		imageLinks: [],
		startsOn: "2026-10-01",
		time: "",
		startTime: "19:00",
		endTime: "23:00",
		repeatEvery: 1,
		repeatUnit: "week",
		weekdays: ["thu"],
		monthDay: 0,
		endsOn: "2026-12-31",
		skippedDates: [],
		extraDates: [],
		slug: "jazz-night",
		replacesSeries: "",
		driveFolderId: "",
		driveFolderUrl: "",
		mainImage: null,
		heroCrops: null,
		images: [],
		dates: [night("2026-10-08")],
		publish: { preview: "current", live: "current", nextDate: "", previewDates: [] },
		...fields,
	};
}

/** An editor opened at `path`, with `events` loaded as the page would. */
async function open(path: string, events: OpsEvent[] = [series()]) {
	api.getEvents.mockResolvedValue({ events });
	const editor = new EventEditor(() => path);
	await editor.reload();
	if (editor.route.isNew) editor.blank();
	return editor;
}

const submit = () => new Event("submit");

beforeEach(() => {
	vi.clearAllMocks();
});

describe("EventEditor: opening", () => {
	it("loads the events and fills the form for the series in the address", async () => {
		const editor = await open("/events/ev1/schedule");
		assert.equal(editor.eventId, "ev1");
		assert.equal(editor.tab, "schedule");
		assert.equal(editor.current?.name, "Jazz Night");
		assert.equal(editor.form.name, "Jazz Night");
		assert.equal(editor.formDirty, false);
		assert.equal(editor.loading, false);
	});

	it("opens one night of a series from its address", async () => {
		const editor = await open("/events/ev1@2026-10-08");
		assert.equal(editor.editingOccurrence, true);
		assert.equal(editor.occurrenceDate, "2026-10-08");
		assert.equal(editor.form.startsOn, "2026-10-08");
		assert.equal(editor.formDirty, false);
	});

	it("says so when the event isn't there", async () => {
		const editor = await open("/events/gone");
		assert.equal(editor.error, "Event not found.");
		assert.equal(editor.missing, true);
	});
});

describe("EventEditor: saving a series", () => {
	it("asks for a name under the name, without a toast, and saves nothing", async () => {
		const editor = await open("/events/new/schedule");
		await editor.onSave(submit());
		assert.equal(editor.errors.get("event-name"), "Add a name.");
		assert.equal(editor.errors.count, 2, "the description too");
		assert.equal(editor.error, "");
		assert.equal(toast.error.mock.calls.length, 0);
		assert.equal(api.createEvent.mock.calls.length, 0);
	});

	it("asks for a description, which the website needs, and switches to Details for it", async () => {
		const editor = await open("/events/new/schedule");
		editor.form.name = "Quiz";
		await editor.onSave(submit());
		assert.equal(editor.errors.get("event-description"), "Add a description. The website needs one.");
		assert.equal(nav.navigate.mock.calls[0][0], "/events/new");
	});

	it("asks for an end date on a repeating series with a start, on Schedule", async () => {
		const editor = await open("/events/ev1");
		editor.form.endsOn = "";
		await editor.onSave(submit());
		assert.equal(editor.errors.get("event-ends"), "Add the last night of the series.");
		assert.equal(nav.navigate.mock.calls[0][0], "/events/ev1/schedule");
		assert.equal(api.updateEvent.mock.calls.length, 0);
	});

	it("forgets the problems when another event opens", async () => {
		const editor = await open("/events/new");
		await editor.onSave(submit());
		assert.ok(editor.errors.count);
		editor.blank();
		assert.equal(editor.errors.count, 0);
	});

	it("creates a new series, opens it, and queues the website copy", async () => {
		const editor = await open("/events/new");
		editor.form.name = "Quiz";
		editor.form.description = "<p>Pub quiz.</p>";
		const saved = series({ id: "ev9", name: "Quiz", repeatUnit: "none", dates: [] });
		api.createEvent.mockResolvedValue({ event: saved, warnings: [] });
		await editor.onSave(submit());
		assert.equal(api.createEvent.mock.calls[0][0].name, "Quiz");
		assert.equal(editor.current?.id, "ev9");
		assert.deepEqual(nav.navigate.mock.calls.at(-1), ["/events/ev9", { replace: true }]);
		assert.deepEqual(jobs.queueWebsiteJob.mock.calls.at(-1), ["ev9"]);
		assert.equal(toast.ok.mock.calls.at(-1)?.[0], "Series saved.");
		assert.equal(editor.saving, false);
	});

	it("shows the error and stays put when saving fails", async () => {
		const editor = await open("/events/ev1");
		editor.form.offer = "£12";
		api.updateEvent.mockRejectedValue(new Error("Baserow is down."));
		await editor.onSave(submit());
		assert.equal(editor.error, "Baserow is down.");
		assert.equal(editor.formDirty, true, "the edit is kept");
		assert.equal(editor.saving, false);
	});
});

describe("EventEditor: a special event on a series night", () => {
	it("asks whether it replaces the series' night, and saves the answer", async () => {
		const editor = await open("/events/new/once");
		editor.form.name = "Halloween";
		editor.form.description = "Spooky.";
		editor.form.startsOn = "2026-10-08";
		await editor.onSave(submit());
		assert.equal(editor.replacePrompt?.slug, "jazz-night");
		assert.equal(api.createEvent.mock.calls.length, 0);

		api.createEvent.mockResolvedValue({ event: series({ id: "ev2", repeatUnit: "once" }), warnings: [] });
		await editor.chooseConflict(false);
		assert.equal(editor.replacePrompt, null);
		assert.equal(api.createEvent.mock.calls[0][0].replacesSeries, "keep:jazz-night");
	});
});

describe("EventEditor: one night", () => {
	it("asks which nights a change applies to on a repeating series", async () => {
		const editor = await open("/events/ev1@2026-10-08");
		editor.form.defaultsUnlocked = true;
		editor.form.artist = "Guest";
		await editor.onSave(submit());
		assert.equal(editor.saveScopeOpen, true);
		assert.equal(api.updateEventOccurrence.mock.calls.length, 0);

		api.updateEventOccurrence.mockResolvedValue({ event: series(), warnings: [] });
		await editor.saveOccurrenceWithScope("following");
		assert.equal(editor.saveScopeOpen, false);
		const [id, date, body] = api.updateEventOccurrence.mock.calls[0];
		assert.deepEqual([id, date, body.scope, body.artist], ["ev1", "2026-10-08", "following", "Guest"]);
	});

	it("saves a night of an open series straight away", async () => {
		const editor = await open("/events/ev1@2026-10-08", [series({ repeatUnit: "none" })]);
		api.updateEventOccurrence.mockResolvedValue({ event: series({ repeatUnit: "none" }), warnings: [] });
		editor.form.defaultsUnlocked = true;
		editor.form.offer = "Free entry";
		await editor.onSave(submit());
		assert.equal(editor.saveScopeOpen, false);
		assert.equal(api.updateEventOccurrence.mock.calls[0][2].scope, "this");
	});

	it("adds a night to a series from New event, then opens that night", async () => {
		const editor = await open("/events/new/once");
		editor.attachSeriesId = "ev1";
		editor.form.startsOn = "2026-10-15";
		api.ensureEventOccurrence.mockResolvedValue({ event: series(), created: true, warnings: [] });
		await editor.onSave(submit());
		assert.deepEqual(api.ensureEventOccurrence.mock.calls[0].slice(0, 2), ["ev1", "2026-10-15"]);
		assert.equal(nav.navigate.mock.calls.at(-1)?.[0], "/events/ev1@2026-10-15");
		assert.equal(toast.ok.mock.calls.at(-1)?.[0], "Night added to the series.");
	});

	it("sends night slots typed on a new night, labelled ones only (#151)", async () => {
		const editor = await open("/events/new/once");
		editor.attachSeriesId = "ev1";
		editor.form.startsOn = "2026-10-15";
		editor.form.nightSchedule = [
			{ label: " Open decks ", startTime: "20:00", endTime: "21:00" },
			{ label: "", startTime: "", endTime: "" },
		];
		api.ensureEventOccurrence.mockResolvedValue({ event: series(), created: true, warnings: [] });
		await editor.onSave(submit());
		assert.deepEqual(api.ensureEventOccurrence.mock.calls[0][2].nightSchedule, [
			{ label: "Open decks", startTime: "20:00", endTime: "21:00" },
		]);
	});

	it("leaves a new night on the series' slots when none are typed", async () => {
		const editor = await open("/events/new/once");
		editor.attachSeriesId = "ev1";
		editor.form.startsOn = "2026-10-15";
		api.ensureEventOccurrence.mockResolvedValue({ event: series(), created: true, warnings: [] });
		await editor.onSave(submit());
		assert.equal("nightSchedule" in api.ensureEventOccurrence.mock.calls[0][2], false);
	});

	it("uploads a photo picked before the first save to the new night", async () => {
		const editor = await open("/events/new/once");
		editor.attachSeriesId = "ev1";
		editor.form.startsOn = "2026-10-15";
		editor.pendingPhoto = new File(["x"], "flyer.jpg", { type: "image/jpeg" });
		api.ensureEventOccurrence.mockResolvedValue({ event: series(), created: true, warnings: [] });
		api.uploadEventOccurrenceImage.mockResolvedValue({ event: series() });
		await editor.onSave(submit());
		assert.deepEqual(api.uploadEventOccurrenceImage.mock.calls[0].slice(0, 2), ["ev1", "2026-10-15"]);
	});
});

describe("EventEditor: delete, calendar", () => {
	it("deletes a series and leaves the editor", async () => {
		const editor = await open("/events/ev1");
		api.deleteEvent.mockResolvedValue({ ok: true, pending: true, warnings: [] });
		await editor.performDelete("series");
		assert.equal(api.deleteEvent.mock.calls[0][0], "ev1");
		assert.equal(editor.events.length, 0);
		assert.equal(nav.leaveEditor.mock.calls.length, 1);
		assert.equal(toast.ok.mock.calls.at(-1)?.[0], "Event deleted. It comes off the website when you press Update website on the Website page.");
	});

	it("deletes only the night on a night of an open series, not the series (#151)", async () => {
		const openSeries = series({ repeatUnit: "none", dates: [night("2026-10-08"), night("2026-10-15")] });
		const editor = await open("/events/ev1@2026-10-08", [openSeries]);
		editor.requestDelete();
		assert.equal(editor.deleteScopeOpen, false, "an open series has no scope to choose");
		assert.equal(editor.deleteOpen, true);
		api.deleteEventOccurrence.mockResolvedValue({
			deleted: false,
			event: series({ repeatUnit: "none", dates: [night("2026-10-15")] }),
			removed: 1,
			warnings: [],
		});
		// The confirm dialog's Delete button.
		await editor.performDelete("series");
		assert.equal(api.deleteEvent.mock.calls.length, 0);
		assert.deepEqual(api.deleteEventOccurrence.mock.calls[0], ["ev1", "2026-10-08", "this"]);
		assert.equal(toast.ok.mock.calls.at(-1)?.[0], "Night deleted.");
	});

	it("won't update the calendar with unsaved changes", async () => {
		const editor = await open("/events/ev1");
		editor.form.offer = "£12";
		await editor.onSyncCalendar();
		assert.equal(api.syncEventCalendar.mock.calls.length, 0);
	});
});
