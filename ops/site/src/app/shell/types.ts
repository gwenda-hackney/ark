/** One tab of a page with tabs: its own address, so it can be shared (#312). */
export type NavTab = {
	id: string;
	label: string;
	path: string;
	/** Off for now: the tab stays in its place, greyed out, saying why (`reason`). */
	disabled?: boolean;
	reason?: string;
};

/**
 * One item in the ops side rail: a page, or a heading over pages (#312: one
 * level, no groups inside groups).
 */
export type NavRoute = {
	id: string;
	name: string;
	/** Key into the shell icon map. */
	icon: string;
	/** Destination. Absent on headings. */
	path?: string;
	/** A heading's pages. */
	children?: NavRoute[];
	/** Static section label. Children stay visible. Not a link or a toggle. */
	heading?: boolean;
	/**
	 * A page with tabs (Stock: Inventory | Suppliers). The first tab is the
	 * page's own `path`; each tab's address lights this page in the rail.
	 */
	tabs?: NavTab[];
	/** Hidden unless the signed-in user is an admin. */
	adminOnly?: boolean;
	/** Shorter name for the phone tab strip. Falls back to `name`. */
	short?: string;
	/** One-line explanation under the name on the phone More page. */
	hint?: string;
	/** Shows the "waiting for the website" count. */
	badge?: "website";
};
