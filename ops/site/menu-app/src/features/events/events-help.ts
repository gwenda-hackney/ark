import type { PageHelpTopic } from "../../ui/types";

export const EVENTS_HELP: PageHelpTopic[] = [
	{
		title: "Series",
		body: "Series lists every residency by weekday. Open a series to edit name, schedule, Images (What's on framing), and Publish. You can edit a series even when it has no upcoming nights.",
	},
	{
		title: "Schedule",
		body: "Schedule is the calendar of upcoming nights. Open a night for guest artist, offer, or a one-off flyer. Use Edit series on a night to jump back to the series defaults.",
	},
	{
		title: "Series and nights",
		body: "A series is the home for related nights. Residencies can repeat weekly. Open series like Gwenda Nights do not repeat: each night is scheduled on its own date.",
	},
	{
		title: "Assigning to a series",
		body: "On Details, use Series to place a night. When creating, leave it empty for a new series or one-off event, or pick a series to add the night there. When editing a night, change Series to move it onto another series.",
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
		body: "Optional. On a night, a guest of its own is treated as a special edition on What's on and labelled Guest under Nights ahead. On a series, this is the default name when a night has none.",
	},
	{
		title: "Offer",
		body: "Optional public wording for the night, such as a drink deal.",
	},
	{
		title: "Default hero",
		body: "What's on shows the next night's flyer when that night has its own photo. The series hero is the fallback. A night flyer is for that night only. Save, then Update preview.",
	},
	{
		title: "Publish",
		body: "The series is the template. Nights are what appear on the site. Update preview writes this series' upcoming nights to the preview site. Push live copies those nights to gwenda.co.uk.",
	},
];
