import type { PageHelpTopic } from "../../ui/types";

export const EVENTS_HELP: PageHelpTopic[] = [
	{
		title: "Series",
		body: "Series lists every residency by weekday, with time, guest, the next night, and offer. Open a series to edit name, schedule, the What's on photo, and Publish. You can edit a series even when it has no upcoming nights.",
	},
	{
		title: "Schedule",
		body: "Schedule lists upcoming nights by week. Calendar shows the same nights on a month grid. Open a night for guest artist, offer, or a one-off flyer. Use Edit series on a night to jump back to the series defaults.",
	},
	{
		title: "Series and nights",
		body: "A series is the home for related nights. Residencies can repeat weekly. Open series like Gwenda Nights do not repeat: each night is scheduled on its own date.",
	},
	{
		title: "Assigning to a series",
		body: "When creating, pick a series to add a night, or leave it empty for a new series. A night stays on that series. Open Edit series from the night if you need the shared defaults.",
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
		title: "Guest Artist",
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
		body: "The photo on Details is the What's on flyer. The gold frame is the card: drag it, and zoom to tighten. What's on shows the next night's flyer when that night has its own photo. The series photo is the fallback. The original file is also saved in that series Drive folder. Save, then Update preview.",
	},
	{
		title: "Gallery",
		body: "Images is the Drive gallery for this event. Those photos are not the What's on flyer. The flyer is the photo on Details.",
	},
	{
		title: "Google Calendar",
		body: "Saving a series or a night updates Google Calendar. Update calendar on a saved series sends the upcoming nights again without saving, and without publishing What's on. Save first if the series has unsaved edits.",
	},
	{
		title: "Publish",
		body: "Header Publish opens this workflow for one series. Update preview on Series or Schedule opens the same steps for every series: how many still need a preview, a link to staging What's on, then Push live. The button counts whatever step is left. Update preview writes the staging diary, which shows on refresh without a site rebuild. If What's on already has the event and looks wrong, use Republish preview. Publish the staging site only when you need every page rebuilt. That takes a few minutes, and the page shows its progress.",
	},
];
