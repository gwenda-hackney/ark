/**
 * What a menu item card shows, worked out from a list row so the card and
 * the table never disagree. Badges are things worth a second look only:
 * analysis issues, a POS mismatch, changes not yet on the website, and
 * drinks guests cannot see.
 */
import { issueBadgeTone, posStatusBadge, type BadgeSpec, type BadgeTone } from "../ui/badge.ts";
import { publishLiveLabel } from "./publish.ts";
import { normalizeDrinkType, type DrinkType } from "./types.ts";
import type { MenuListItem } from "./menu-list.ts";

export type MenuCard = {
	id: string;
	title: string;
	/** Section, with its chapter when it is a subsection. */
	section: string;
	kind: string;
	photo: string;
	/** Fallback tile when there is no photo: the first letter, with the drink type for styling. */
	swatch: { initial: string; hue: DrinkType };
	price: string;
	cost: string;
	pour: { label: string; tone: BadgeTone; hint: string };
	badges: (BadgeSpec & { title?: string })[];
};

function sectionLine(row: MenuListItem): string {
	const title = row.section?.title || "";
	const parent = row.section?.parentTitle || "";
	if (parent && title) return `${parent} · ${title}`;
	return title;
}

/** Cocktails by build (Sour, Spritz), the rest by type. Skipped when the section already says it. */
function kindLine(row: MenuListItem): string {
	const category = row._categoryLabel && row._categoryLabel !== "—" ? row._categoryLabel : "";
	const kind = category || row._typeLabel || "";
	return kind.toLowerCase() === (row.section?.title || "").toLowerCase() ? "" : kind;
}

function pourTone(tone: MenuListItem["_pourTone"]): BadgeTone {
	if (tone === "up") return "success";
	if (tone === "down") return "warning";
	if (tone === "loss") return "danger";
	return "neutral";
}

export function menuCardBadges(row: MenuListItem): MenuCard["badges"] {
	const out: MenuCard["badges"] = [];
	const issues = row._issueCount || 0;
	if (issues > 0) {
		out.push({
			label: `${issues} issue${issues === 1 ? "" : "s"}`,
			tone: issueBadgeTone(row._issueTone),
			title: row._issueHint,
		});
	}
	const pos = posStatusBadge(row._posStatus);
	if (pos && pos.tone !== "success") out.push(pos);
	if (row._publishPending) {
		out.push({ label: "Not live", tone: "warning", title: publishLiveLabel(row.publish) });
	}
	if (row._guestPlacement === "none") {
		out.push({ label: "POS only", tone: "neutral", title: "Not on the guest menus" });
	}
	return out;
}

export function menuCard(row: MenuListItem): MenuCard {
	const title = row.name?.trim() || "Untitled";
	return {
		id: String(row._id || row.name || ""),
		title,
		section: sectionLine(row),
		kind: kindLine(row),
		photo: row.image?.asset?.url || "",
		swatch: {
			initial: title.charAt(0).toUpperCase(),
			hue: normalizeDrinkType(row.drinkType),
		},
		price: row._priceLabel && row._priceLabel !== "—" ? row._priceLabel : "No price",
		cost: row._costLabel || "—",
		pour: {
			label: row._pourLabel || "—",
			tone: pourTone(row._pourTone),
			hint: row._pourHint || "",
		},
		badges: menuCardBadges(row),
	};
}

/** A card-sized photo: Sanity crops to 4:3; other hosts (Baserow files) can't, so they pass through. */
export function cardPhotoUrl(url: string | null | undefined, width = 640): string {
	const raw = String(url || "").trim();
	if (!raw || !raw.includes("cdn.sanity.io")) return raw;
	const base = raw.split("?")[0] || raw;
	return `${base}?w=${width}&h=${Math.round((width * 3) / 4)}&fit=crop&auto=format`;
}
