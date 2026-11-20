import type { PageHelpTopic } from "../ui/types";

/** Help in the one-off email editor (#348): its Help button opens these. */
export const ONE_OFF_HELP: PageHelpTopic[] = [
	{
		title: "Changing the email",
		body: "The page is the email as people get it, and you change it right there. Type the subject and the preview line at the top. Click any words and type. Click a picture, button or anything else to pick it: a small toolbar appears on it (Change picture, Bold, Link, Remove). Drag a part by its gold handle on the left to move it. The logo at the top and the foot are always there.",
	},
	{
		title: "Adding something",
		body: "Press a + between two parts of the email to add something there: a Picture (one of our photos, or upload one), a Heading, Text, a Row (two or three side by side: pictures, our logo, a ×), an Event (a night, deal or pop-up from What's on, as the monthly email shows it), a Button, a Divider line, or Book a table.",
	},
	{
		title: "More",
		body: "More (at the top, or on a part's toolbar) slides out a panel: the email's name, every part in order to jump to, and the picked part's settings, like a picture's size, a Row's cells, or a button's words and where it goes. In a Row, drag a cell onto another to swap them.",
	},
	{
		title: "Bold and links",
		body: "In text, select some words, then press Bold or Link on its toolbar. For a link, type where it goes: a web address like gwenda.co.uk/whats-on, or an email address. Enter starts a new paragraph.",
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
