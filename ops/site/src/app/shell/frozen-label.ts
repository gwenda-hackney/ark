/** What the maintenance banner calls each frozen feature (#191, shared/write-freeze.js). */
const LABELS: Record<string, string> = {
	events: "Events",
	menu: "Menu and inventory",
	artists: "Artists",
	users: "Users",
	guests: "Forms and guest lists",
};

/** "Events", "Events and Artists", "Events, Artists and Users". */
export function frozenList(features: string[]): string {
	const names = features.map((feature) => LABELS[feature] ?? feature);
	if (names.length <= 1) return names[0] ?? "";
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
