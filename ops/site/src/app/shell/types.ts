/** One item in the ops side rail. Groups omit `path` and list `children`. */
export type NavRoute = {
	id: string;
	name: string;
	/** Key into the shell icon map. */
	icon: string;
	/** Destination. Absent on grouping rows. */
	path?: string;
	children?: NavRoute[];
	/** Static section label. Children stay visible. Not a link or a toggle. */
	heading?: boolean;
	/** Hidden unless the signed-in user is an admin. */
	adminOnly?: boolean;
	/** Shorter name for the phone tab strip. Falls back to `name`. */
	short?: string;
	/** One-line explanation under the name on the phone More page. */
	hint?: string;
	/** Shows the "waiting for the website" count. */
	badge?: "website";
};
