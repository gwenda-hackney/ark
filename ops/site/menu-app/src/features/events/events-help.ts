import type { PageHelpTopic } from "../../ui/types";

export const EVENTS_HELP: PageHelpTopic[] = [
	{
		title: "Series",
		body: "Series lists every residency by weekday, with time, guest, the next night, and offer. Open a series to edit name, schedule, and the What's on photo. You can edit a series even when it has no upcoming nights.",
	},
	{
		title: "Schedule",
		body: "Schedule lists upcoming nights by week. Calendar shows the same nights on a month grid. Open a night for guest/collaboration, offer, or a one-off flyer. Use Edit series on a night to jump back to the series defaults.",
	},
	{
		title: "Series and nights",
		body: "A series is the home for related nights. Residencies can repeat weekly. Open series like Gwenda Nights do not repeat: each night is scheduled on its own date.",
	},
	{
		title: "Assigning to a series",
		body: "To add a night to a series, press New event on the Schedule and pick the series, or press Add night on the series itself. Leave the series on No series for a special event. A night stays on that series. Open Edit series from the night if you need the shared defaults.",
	},
	{
		title: "Repeating dates",
		body: "For repeating series, Starts on, Ends on, Unit, and weekdays build the calendar. For Does not repeat, leave Starts on empty until you schedule a night, then add further nights one by one.",
	},
	{
		title: "Moving a night",
		body: "On a night, change Date and save This event. The series window stays the same. The old date is skipped and the new date is kept for that night only.",
	},
	{
		title: "Guest/collaboration",
		body: "Optional. On an open series night, a guest of its own shows a star on Schedule. Recurring residencies just list the guest under that night. On a series, this is the default name when a night has none.",
	},
	{
		title: "Offer",
		body: "Optional public wording for the night, such as a drink deal.",
	},
	{
		title: "Night schedule",
		body: "Optional structured slots for the night, such as Open decks or Chess. Each slot needs a label and can include start and end times. When set, What's on shows them in gold under the series.",
	},
	{
		title: "Default hero",
		body: "The photo on Details is the What's on flyer. The gold frame is the card: drag it, and zoom to tighten. What's on shows the next night's flyer when that night has its own photo. The series photo is the fallback. Original downloads the file as it was uploaded.",
	},
	{
		title: "Gallery",
		body: "Images is the Drive gallery for this event. Those photos are not the What's on flyer. The flyer is the photo on Details.",
	},
	{
		title: "Google Calendar",
		body: "Saving a series or a night updates Google Calendar a minute or so later. Update calendar on a saved series sends the upcoming nights again without saving. Save first if the series has unsaved edits.",
	},
	{
		title: "The website",
		body: "Saving keeps your changes in ops straight away. The header says \"Getting it ready…\" for a minute while the calendar and website copy catch up. When the event is ready, press Update website to put it on gwenda.co.uk. What's on shows it straight away, and the event's own page updates by itself a few minutes after you stop making changes. The Website page in the menu shows anything waiting. Deleting an event takes it off the website too, straight away.",
	},
];
