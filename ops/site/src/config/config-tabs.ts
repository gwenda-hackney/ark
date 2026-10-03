/** Configuration's tabs, in order. The first is where /config opens. */
export const CONFIG_TABS = [
	{ id: "sections", label: "Menu sections" },
	{ id: "pour", label: "Pour cost" },
	{ id: "tasks", label: "Event tasks" },
	{ id: "environment", label: "Environment" },
] as const;

export type ConfigTab = (typeof CONFIG_TABS)[number]["id"];

/** The tab for a path's `tab` segment; anything unknown opens the first. */
export function configTab(segment: string | null | undefined): ConfigTab {
	return CONFIG_TABS.find((tab) => tab.id === segment)?.id ?? CONFIG_TABS[0].id;
}

export function configTabPath(tab: ConfigTab): string {
	return tab === CONFIG_TABS[0].id ? "/config" : `/config/${tab}`;
}
