import type { PageHelpTopic } from "../ui/types";

/**
 * Help drawer for the featured artist editor. A field's "?" opens one topic
 * by its title (`help="Place"`).
 */
export const ARTIST_HELP: PageHelpTopic[] = [
	{
		title: "Artist name",
		body: "The first name in From on their page. Leave it blank to use the first word of the full name.",
	},
	{
		title: "Place",
		body: "Current is on the wall. Next is lined up. Previous has already hung here. Only one current and one next: saving that badge moves the artist who had it to previous.",
	},
	{
		title: "Months",
		body: "The months under their name on the home page, shown as Sept to Oct.",
	},
	{
		title: "Profile and Bio",
		body: "Profile is a short introduction, above the longer bio. Bio is the fuller note on their page.",
	},
];
