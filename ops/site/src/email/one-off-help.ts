import type { PageHelpTopic } from "../ui/types";

/** Help in the one-off email editor (#348): its Help button opens these. */
export const ONE_OFF_HELP: PageHelpTopic[] = [
	{
		title: "What goes in it",
		body: "The logo at the top and the foot (links, unsubscribe, address) are always there. In between go your sections, in order: an Image, a Heading, Copy or a Button. Add them at the bottom; move them with the arrows; the bin takes one out. The preview beside it is the email as it arrives.",
	},
	{
		title: "Copy",
		body: "Plain text. A blank line starts a new paragraph. **Two stars** either side makes words bold. [words](https://gwenda.co.uk/whats-on) makes a link; links must start https://, http:// or mailto:, anything else stays plain words.",
	},
	{
		title: "Send me a test",
		body: "Sends the saved email to your own address, as the list would get it. Save first. A few tests an hour each, shared with the weekly email's.",
	},
	{
		title: "Saving",
		body: "Nothing is kept until you press Save email. Leaving with changes asks first.",
	},
];
