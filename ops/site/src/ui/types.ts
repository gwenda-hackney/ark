/** Shapes shared between primitives and their call sites. */

export type SelectOption = {
	value: string;
	label: string;
	/** Trailing detail — shown dimmed on the right of the row. */
	hint?: string;
	disabled?: boolean;
};

export type SegmentedItem = {
	id: string;
	label: string;
	/** Row tally rendered as a trailing chip. */
	count?: number;
	disabled?: boolean;
	/** When set, the tab is a real link so the active section can be shared. */
	href?: string;
};

/** One control (or group of controls) explained in a page help drawer. */
export type PageHelpTopic = {
	/** Stable id, so a field's "?" can open the drawer at this topic. */
	id?: string;
	title: string;
	body: string;
};

/** One action in an OverflowMenu ("⋯"). */
export type OverflowItem = {
	label: string;
	onselect: () => void;
	tone?: "destructive";
	disabled?: boolean;
	/** Why it's disabled, shown under the label ("Save the drink first"). */
	reason?: string;
};
