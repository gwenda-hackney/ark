/**
 * The menu on the website, from the browser: after a save it follows by
 * itself (followMenuSaves), and Update website says how it went
 * (publishedToasts). A menu's page and Items both use these, so they say the
 * same thing.
 */
import * as api from "../app/api";
import { toast } from "../ui/toast.svelte";
import { refreshSitePending } from "../website/site-pending.svelte";

function missingToast(missing: string[] | undefined) {
	if (missing?.length) {
		toast.error(`${missing.length} need a menu section before they can go on the website: ${missing.join(", ")}.`);
	}
}

/**
 * After the menu is saved: it goes on the website by itself (or waits on
 * the preview when the setting says so). A failure doesn't undo the save:
 * it says so, and Update website puts it there.
 */
export async function followMenuSaves(): Promise<{ released: boolean } | null> {
	try {
		const data = await api.followMenuWebsite();
		for (const warning of data.warnings || []) toast.info(warning);
		missingToast(data.missing);
		void refreshSitePending();
		return { released: data.released };
	} catch (err) {
		toast.error(`Saved, but it didn't go on to the website: ${err instanceof Error ? err.message : "something went wrong"}. Update website puts it there.`);
		return null;
	}
}

/** What Update website says once it's done. */
export function publishedToasts(data: Awaited<ReturnType<typeof api.publishMenu>>) {
	for (const warning of data.warnings || []) toast.info(warning);
	const missing = data.sync?.missing || [];
	missingToast(missing);
	if (missing.length && !data.published && !data.building) return;
	if (data.building) toast.ok("Menu on the website. The menu page shows it in about 2 minutes.");
	else if (data.published) toast.ok("Menu on the website. The menu page shows it after the next website update.");
	else toast.ok("The website already shows this menu.");
	void refreshSitePending();
}
