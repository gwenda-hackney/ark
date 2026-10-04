import type { PageHelpTopic } from "../ui/types";

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
		body: "Press New event on the Schedule and choose Night for a series, then pick the series. Or press Add night on the series itself. Choose Special event for a one-off. On a night, anything marked From series follows the series: press Override to change it for that night, and Use series value to go back.",
	},
	{
		title: "Repeating dates",
		body: "Under When on a series, Repeats, Every, the weekdays, First night and Last night build the calendar. Nights lists the dates they make. For Doesn't repeat, leave the first night empty until one is booked, then add nights one by one.",
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
		title: "Web address",
		body: "On a series, Web address is the end of its page link: gwenda.co.uk/whats-on/… It starts from the name and stays the same when you rename the series. Change it here if you want a different link. The website changes when you press Update website, and old links still lead to the page. RSVPs and tickets people already have keep working.",
	},
	{
		title: "Default hero",
		body: "The Photo on Details is the What's on flyer. The gold frame is the card: drag it, and zoom to tighten. What's on shows the next night's flyer when that night has its own photo. The series photo is the fallback. Original downloads the file as it was uploaded.",
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
		body: "Saving keeps your changes in ops straight away. The header says \"Getting it ready…\" for a minute while the calendar and website copy catch up. When the event is ready, press Update website to put it on gwenda.co.uk. It shows there straight away, on What's on and on the event's own page, and the header then says On the website: click it to open the page. Deleting an event or a night works the same way: it leaves the website when you press Update website. A deleted event is listed on the Website page until then, with Restore.",
	},
];
