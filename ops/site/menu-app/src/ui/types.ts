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
};
