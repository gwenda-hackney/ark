import type { PageHelpTopic } from "../ui/types";

/** Help in the one-off email editor (#348): its Help button opens these. */
export const ONE_OFF_HELP: PageHelpTopic[] = [
	{
		title: "Changing the email",
		body: "The email below is the email as people get it, and you change it right there. Click any words and type. Click a picture, button or anything else to pick it: the bar above the email then moves it up or down, removes it, and has what that part needs (Change picture, a button's words and where it goes). The logo at the top and the foot at the bottom are always there.",
	},
	{
		title: "Adding something",
		body: "Press a + between two parts of the email to add something there: a Picture (one of our photos, or upload one), Two pictures side by side, a Heading, Text, an Event (a night, deal or pop-up from What's on, as the monthly email shows it), a Button, a Divider line, or Book a table.",
	},
	{
		title: "Bold and links",
		body: "In text, select some words, then press Bold or Link above the email. For a link, type where it goes: a web address like gwenda.co.uk/whats-on, or an email address. Enter starts a new paragraph.",
	},
	{
		title: "Send me a test",
		body: "Sends the saved email to your own address, as the list would get it. Save first. A few tests an hour each, shared with the monthly email's.",
	},
	{
		title: "Saving",
		body: "Nothing is kept until you press Save email. Leaving with changes asks first.",
	},
];
