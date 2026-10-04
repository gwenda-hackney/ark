/**
 * Links in event descriptions (#33). The website shows only web, email,
 * phone and site links; these turn what an editor types into one of those,
 * and find any other kind before the event saves.
 */

/** A link the website shows, as stored: https://…, mailto:, tel: or /…. */
export function isShownLink(href: string): boolean {
	const value = String(href ?? "").trim();
	if (/^\/(?!\/)/.test(value)) return true;
	return /^(https?:\/\/|mailto:|tel:)\S+$/i.test(value);
}

/**
 * What the editor typed in the link box, as an address: "@handle" is their
 * Instagram, an email gets mailto:, a phone number tel:, a bare domain
 * https://. "" when it can't be a link we show.
 */
export function normalizeDescriptionLink(input: string): string {
	const value = String(input ?? "").trim();
	if (!value) return "";
	const handle = value.match(/^@([A-Za-z0-9._]{1,30})$/);
	if (handle) return `https://www.instagram.com/${handle[1]}/`;
	if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;
	if (/^\+?[\d\s()-]{7,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
	if (isShownLink(value)) return value;
	if (/^[a-z][a-z\d+.-]*:/i.test(value)) return "";
	if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
	return "";
}

/** Addresses in the description's Markdown links that the website wouldn't show. */
export function unshownDescriptionLinks(markdown: string): string[] {
	const out: string[] = [];
	for (const match of String(markdown ?? "").matchAll(/(?<!\\)\[[^\]]*\]\(([^)]*)\)/g)) {
		if (!isShownLink(match[1])) out.push(match[1]);
	}
	return out;
}

/**
 * The description's Markdown as text to read (a night's "From series"
 * readout): marks dropped, links as their text, bullets as "• ".
 */
export function descriptionReadout(markdown: string): string {
	return String(markdown ?? "")
		.replace(/(?<!\\)\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
		.replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
		.replace(/(?<!\\)\*{1,2}/g, "")
		.replace(/\\([\\*[\]])/g, "$1")
		.replace(/ {2}\n/g, "\n")
		.trim();
}
