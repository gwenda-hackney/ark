/** Fake full-width group header mixed into rowData (Community has no row grouping). */
export type FullWidthGroupRow = {
	_kind?: string;
	_id?: string;
	sectionId?: string;
	_sectionOrder?: number;
};

/**
 * After a column sort, put each section header back with its items.
 * AG Grid sorts these header rows as empty cells, so they otherwise all
 * rise to the top. Items keep the order the comparator already applied.
 */
export function keepFullWidthGroupsTogether<T extends FullWidthGroupRow>(
	nodes: Array<{ data?: T | null }>,
): void {
	if (nodes.length === 0) return;

	type Node = (typeof nodes)[number];
	type Bucket = {
		order: number;
		header?: Node;
		items: Node[];
	};
	const buckets = new Map<string, Bucket>();

	function bucket(key: string, order: number): Bucket {
		let next = buckets.get(key);
		if (!next) {
			next = { order, items: [] };
			buckets.set(key, next);
		} else if (order < next.order) {
			next.order = order;
		}
		return next;
	}

	for (const node of nodes) {
		const row = node.data;
		if (!row) continue;
		const order = row._sectionOrder ?? Number.MAX_SAFE_INTEGER;
		if (row._kind === "group") {
			bucket(String(row._id || ""), order).header = node;
		} else {
			bucket(`section:${row.sectionId || ""}`, order).items.push(node);
		}
	}

	const ordered = [...buckets.values()].sort((a, b) => a.order - b.order);
	let i = 0;
	for (const group of ordered) {
		if (group.header) nodes[i++] = group.header;
		for (const item of group.items) nodes[i++] = item;
	}
	nodes.length = i;
}

/** A group for one table with heading rows: its name, an optional note, its rows. */
export type GridGroup<T> = { key: string; title: string; note?: string; rows: T[] };
/** A group's heading row, as keepFullWidthGroupsTogether and GroupHeadingCell want it. */
export type GroupHeadingRow = FullWidthGroupRow & { _kind: "group"; _id: string; sectionId: string; _sectionOrder: number; title: string; note?: string; count: number };
/** A row under a heading. */
export type GroupedItem<T> = T & { _kind: "row"; sectionId: string; _sectionOrder: number };
export type GroupedGridRow<T> = GroupHeadingRow | GroupedItem<T>;

/** The groups as one table's rows: each group's heading row, then its rows (sort them with keepFullWidthGroupsTogether). */
export function withGroupRows<T>(groups: GridGroup<T>[]): GroupedGridRow<T>[] {
	return groups.flatMap((group, order): GroupedGridRow<T>[] => [
		{ _kind: "group", _id: `section:${group.key}`, sectionId: group.key, _sectionOrder: order, title: group.title, note: group.note, count: group.rows.length },
		...group.rows.map((row): GroupedItem<T> => ({ ...row, _kind: "row", sectionId: group.key, _sectionOrder: order })),
	]);
}

/** The row's own data, or nothing on a heading row. */
export function groupedItem<T>(row: GroupedGridRow<T> | null | undefined): GroupedItem<T> | undefined {
	return row?._kind === "row" ? row : undefined;
}
