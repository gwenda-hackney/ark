import type { PageHelpTopic } from "../ui/types";

export const EVENTS_HELP: PageHelpTopic[] = [
	{
		title: "Series",
		body: "Series lists every residency by weekday, with time, guest, the next night, and offer. Open a series to edit it: Details has the name, guest, photo and website wording, Schedule has the pattern and nights, Ops has the team's notes. You can edit a series even when it has no upcoming nights.",
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
		body: "On a series' Schedule tab, Repeats, Every, the weekdays, First night and Last night build the calendar. Upcoming nights, below them, lists the dates they make. For Doesn't repeat, leave the first night empty until one is booked, then add nights one by one.",
	},
	{
		title: "Moving a night",
		body: "On a night, change Date and save This event. The series window stays the same. The old date is skipped and the new date is kept for that night only.",
	},
	{
		title: "Name",
		body: "The series or event name on What's on. On a night, Override gives it a title of its own, shown instead of the series name for that night only. Anything marked From series follows the series until you override it.",
	},
	{
		title: "Starts and Ends",
		body: "Under the name on Details: the times each night runs. A night can change them. After midnight is fine.",
	},
	{
		title: "Guest/collaboration and Guest link",
		body: "Optional. Type any name, or pick an approved artist to bring their Instagram or website too. Guest link takes a full address or an @handle. On an open series night, a guest of its own shows a star on Schedule and makes it a special edition on What's on. Recurring residencies just list the guest under that night. On a series, this is the default name when a night has none.",
	},
	{
		title: "Offer",
		body: "Optional public wording for the night, such as a drink deal.",
	},
	{
		title: "Card line and Description",
		body: "Card line is one or two lines on the What's on card. Description is the event's own page on the website. It can have bold, italic, bullet lists and links: select words and press the link button, then type a web address, an @handle (their Instagram), an email, a phone number or a page on the site (/whats-on/…). Shift+Enter starts a new line in the same paragraph.",
	},
	{
		title: "Schedule tab",
		body: "Repeats, Every and On set how often a series runs. For Monthly, a blank Day of month follows the first night. First night can stay blank until it's fixed: the website says to check back soon. Last night is needed once there's a first night. Upcoming nights lists the dates the pattern makes, each with what it changes from the series. For Doesn't repeat, add each night on its own date with Add night. On a night or special event, the date is on Details under the name: changing a night's Date moves that night only.",
	},
	{
		title: "Night schedule",
		body: "Optional structured slots for the night, such as Open decks or Chess. Each slot needs a label and can include start and end times. When set, What's on shows them in gold under the series.",
	},
	{
		title: "Page address",
		body: "On a series, Page address is the end of its page link (letters, numbers and dashes): gwenda.co.uk/whats-on/… It starts from the name and stays the same when you rename the series. Change it here if you want a different link. The website changes when you press Update website, and old links still lead to the page. RSVPs and tickets people already have keep working.",
	},
	{
		title: "Default hero",
		body: "The Photo on Details is the What's on flyer. The gold frame is the card: drag it, and zoom to tighten (scrolling over the photo zooms too). The buttons under it reset the framing, replace the photo, download the original and remove it. A night's own photo is its flyer while it's the next night. What's on shows the next night's flyer when that night has its own photo. The series photo is the fallback. Original downloads the file as it was uploaded.",
	},
	{
		title: "Gallery",
		body: "Photos for the event's page, from its Drive gallery, newest first. They go on the website with Update website. They are not the What's on flyer: the flyer is the photo on Details.",
	},
	{
		title: "Ops tab",
		body: "Notes for the team are never on the website: contacts, fee, setup, access, equipment. The line above them counts the social post tasks in ClickUp.",
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
