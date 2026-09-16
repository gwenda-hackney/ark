/** One item in the ops side rail. Groups omit `path` and list `children`. */
export type NavRoute = {
	id: string;
	name: string;
	/** Key into the shell icon map. */
	icon: string;
	/** Destination. Absent on grouping rows. */
	path?: string;
	children?: NavRoute[];
};
