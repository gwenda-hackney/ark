/**
 * A menu's page: where the menu stands with the website, beside its Update
 * website, and whether that button does anything now. From what Update
 * website would change (api.getMenuWebsiteChanges) and what the website is
 * still building (site-pending).
 */
import type { BadgeTone } from "../ui/badge";

/**
 * What Update website would change now, by menu id; `other` counts for every
 * menu. `follows`: a save goes on the website by itself (website.auto_update).
 */
export type MenuWebsiteChanges = { menus: Record<string, number>; other: number; follows?: boolean };

/**
 * The website's own build: menu documents it doesn't show yet, whether it's
 * at it, and `paused` while local ops runs (hosted dev builds nothing then).
 */
export type MenuSiteBuild = { waiting: boolean; updating: boolean; failed: boolean; paused?: boolean };

export type MenuWebsiteStatus = {
	badge: { label: string; tone: BadgeTone; title: string } | null;
	disabled: boolean;
	reason?: string;
};

/** Pending items on the built website that are a menu's (site-pending's production items). */
export function menuSiteBuild(
	production: { items: { type: string; kind: string }[]; updating: boolean; failed: boolean; paused?: unknown } | null,
): MenuSiteBuild {
	const waiting = Boolean(production?.items.some((item) => item.kind === "menus" || ["menu", "menuItem", "menuSection"].includes(item.type)));
	return {
		waiting,
		updating: waiting && Boolean(production?.updating),
		failed: waiting && Boolean(production?.failed),
		paused: waiting && Boolean(production?.paused),
	};
}

export function menuWebsiteStatus({
	menuId,
	dirty,
	changes,
	checking,
	site,
}: {
	menuId: string;
	/** Unsaved changes on the page. */
	dirty: boolean;
	/** Null while it's being asked, or when asking failed. */
	changes: MenuWebsiteChanges | null;
	checking: boolean;
	site: MenuSiteBuild;
}): MenuWebsiteStatus {
	const pending = changes ? (changes.menus[menuId] || 0) + changes.other : null;
	const follows = changes?.follows !== false;
	const badge =
		pending == null
			? null
			: pending > 0
				? { label: "Not on the website yet", tone: "warning" as const, title: "Saved, but the website doesn't show it. Update website puts it there." }
				: site.failed
					? { label: "Website update failed", tone: "danger" as const, title: "The menu page didn't update. Update website tries again." }
					: site.updating
						? { label: "Updating the website", tone: "neutral" as const, title: "The menu page shows it in about 2 minutes." }
						: site.paused
							? {
									label: "Waits while local ops runs",
									tone: "neutral" as const,
									title: "Hosted dev updates nothing by itself while ops runs on a developer's machine. Update website builds it now.",
								}
							: site.waiting
								? follows
									? {
											label: "Goes on the website by itself",
											tone: "neutral" as const,
											title: "Saved. It goes on the website by itself in a few minutes, once edits are quiet; Update website does it now.",
										}
									: { label: "Waiting for the website", tone: "neutral" as const, title: "Sent: the menu page updates next. Update website does it now." }
								: { label: "On the website", tone: "success" as const, title: "The website shows this menu as saved." };
	if (dirty) return { badge, disabled: true, reason: "Save the menu first" };
	if (pending == null) return checking ? { badge, disabled: true, reason: "Checking the website…" } : { badge, disabled: false };
	if (pending === 0 && site.updating) return { badge, disabled: true, reason: "It's on its way to the website" };
	if (pending === 0 && !site.waiting) return { badge, disabled: true, reason: "The website already shows this menu" };
	return { badge, disabled: false };
}
