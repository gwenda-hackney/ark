/**
 * What the Write tab and the one-off email editor (#348) say and do with a
 * draft, kept out of the components so it's tested: the section list's
 * moves, the status badge, the preview built from the shared renderer.
 */
import { oneOffNotReady, renderOneOffEmail } from "../../../../shared/email/one-off.js";
import { SECTION_KINDS } from "../../../../shared/email/sections.js";
import type { EmailFrame, OneOffDraft, OneOffSection, OneOffStatus, RowCell } from "./email-api";
import type { StatusTone } from "./email-view";
import { movedTo } from "../ui/drag-reorder";

export type SectionKind = OneOffSection["kind"];

/** The kinds the editor offers, in order, with the names the owner sees and what each is for. */
export const SECTION_CHOICES: { kind: SectionKind; label: string; about: string }[] = [
	{ kind: "image", label: "Picture", about: "One of our photos, or a new one" },
	{ kind: "row", label: "Row", about: "Two or three columns side by side: pictures, logos, words" },
	{ kind: "heading", label: "Heading", about: "Big words in the poster letters" },
	{ kind: "copy", label: "Text", about: "Paragraphs, with bold and links" },
	{ kind: "event", label: "Event", about: "A night, deal or pop-up, as the monthly email shows it" },
	{ kind: "button", label: "Button", about: "Words that go to a web page" },
	{ kind: "divider", label: "Divider", about: "A dashed line between parts" },
	{ kind: "booking", label: "Book a table", about: "The website's own booking button" },
];

/** A kind's name for the owner: "Picture", "Text". */
export function partName(kind: SectionKind): string {
	return SECTION_CHOICES.find((choice) => choice.kind === kind)?.label || kind;
}

/** A picture's sizes, for its switch. */
export const IMAGE_SIZE_ITEMS = [
	{ id: "full", label: "Full width" },
	{ id: "logo", label: "Logo" },
] as const;

/** What a Row's column can hold, for its switch. */
export const CELL_ITEMS = [
	{ id: "picture", label: "Picture" },
	{ id: "logo", label: "Our logo" },
	{ id: "words", label: "Words" },
	{ id: "times", label: "×" },
	{ id: "empty", label: "Nothing" },
] as const;

/** A column made to hold `kind` instead; it keeps its width (and a picture its description, if it stays one). */
export function cellHolding(cell: RowCell, kind: RowCell["kind"]): RowCell {
	if (cell.kind === kind) return cell;
	const width = cell.width;
	if (kind === "picture") return { kind, assetId: "", alt: "", width };
	if (kind === "words") return { kind, text: "", width };
	return { kind, width };
}

/** How wide a Row's column is, for its switch. */
export const CELL_WIDTH_ITEMS = [
	{ id: "small", label: "Small" },
	{ id: "medium", label: "Medium" },
	{ id: "large", label: "Large" },
	{ id: "fill", label: "Fill" },
] as const;

/** A button's looks, for its switch. */
export const BUTTON_LOOK_ITEMS = [
	{ id: "link", label: "Link" },
	{ id: "outline", label: "Outline" },
] as const;

/** What a one-off email is called on its card and in the editor: its name, else its subject. */
export function emailName(email: { name?: string; subject?: string }): string {
	return email.name?.trim() || email.subject?.trim() || "";
}

/** A section as the editor holds it: the section, and a key that follows it as it moves. */
export type EditorSection = { key: string; section: OneOffSection };

let nextKey = 0;
const keyed = (section: OneOffSection): EditorSection => ({ key: `s${(nextKey += 1)}`, section });

export function blankSection(kind: SectionKind): OneOffSection {
	return (SECTION_KINDS as Record<string, { blank: () => OneOffSection }>)[kind].blank();
}

export function editorSections(sections: OneOffSection[]): EditorSection[] {
	// A button saved before it had a look is a link; an image saved before it had a size is full width.
	return sections.map((section) => {
		if (section.kind === "button") return keyed({ ...section, look: section.look === "outline" ? "outline" : "link" });
		// "Gwenda ×" was a picture's size; it's a Row now: our logo, ×, the picture.
		if (section.kind === "image" && section.size === "collab") {
			return keyed({
				kind: "row",
				crop: false,
				cells: [
					{ kind: "logo", width: "medium" },
					{ kind: "times", width: "small" },
					{ kind: "picture", assetId: section.assetId, alt: section.alt, width: "medium" },
				],
			});
		}
		if (section.kind === "image") return keyed({ ...section, size: section.size === "logo" ? "logo" : "full" });
		// Rows come cleaned by the server (shared/email/sections.js), sizes and all.
		if (section.kind === "row") return keyed({ kind: "row", crop: Boolean(section.crop), cells: section.cells.map((cell) => ({ ...cell })) });
		return keyed({ ...section });
	});
}

export function addSection(list: EditorSection[], kind: SectionKind): EditorSection[] {
	return [...list, keyed(blankSection(kind))];
}

/** The list with section `from` dropped before section `at` (the count: after the last); the same list when it wouldn't move. */
export function moveSectionTo(list: EditorSection[], from: number, at: number): EditorSection[] {
	return movedTo(list, from, at);
}

/** A Row's cell, by its section and its place in the row. */
export type CellAt = { section: number; cell: number };

/** What two cells hold swapped (each column keeps its size), in one Row or between two; anything else leaves the list as it was. */
export function swapCells(list: EditorSection[], a: CellAt, b: CellAt): EditorSection[] {
	const first = list[a.section]?.section;
	const second = list[b.section]?.section;
	if (first?.kind !== "row" || second?.kind !== "row" || (a.section === b.section && a.cell === b.cell)) return list;
	const one = first.cells[a.cell];
	const two = second.cells[b.cell];
	if (!one || !two) return list;
	const out = list.map((entry) => (entry.section.kind === "row" ? { ...entry, section: { ...entry.section, cells: [...entry.section.cells] } } : entry));
	// What's in them moves; each column keeps its size.
	(out[a.section].section as { cells: RowCell[] }).cells[a.cell] = { ...two, width: one.width };
	(out[b.section].section as { cells: RowCell[] }).cells[b.cell] = { ...one, width: two.width };
	return out;
}

/** A part in a line, for the list beside the email: its words, its picture's description, what's in a row. */
export function partSummary(section: OneOffSection): string {
	const words = (value: string) => value.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
	switch (section.kind) {
		case "heading":
		case "copy":
			return words(section.text) || "Nothing typed yet";
		case "image":
			return section.assetId ? section.alt || "A picture" : "No picture yet";
		case "row":
			return section.cells
				.map((cell) =>
					cell.kind === "logo" ? "Our logo" : cell.kind === "times" ? "×" : cell.kind === "picture" ? cell.alt || "Picture" : cell.kind === "words" ? cell.text || "Words" : "Empty",
				)
				.join(" · ");
		case "button":
			return section.label || "No words yet";
		case "event":
			return section.title || "No event chosen";
		case "booking":
			return "The website's button";
		case "divider":
			return "A dashed line";
	}
}

/** The list with a new, empty `kind` before section `at` (at the end for the count), and its key. */
export function insertSection(list: EditorSection[], at: number, kind: SectionKind): { list: EditorSection[]; key: string } {
	const entry = keyed(blankSection(kind));
	const place = Math.max(0, Math.min(at, list.length));
	return { list: [...list.slice(0, place), entry, ...list.slice(place)], key: entry.key };
}

/** The list with the section at `index` moved one place up (-1) or down (+1); unchanged at an end. */
export function moveSection(list: EditorSection[], index: number, by: -1 | 1): EditorSection[] {
	const to = index + by;
	if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
	const next = [...list];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}

export function removeSection(list: EditorSection[], index: number): EditorSection[] {
	return list.filter((_, at) => at !== index);
}

/** The draft as it would be saved. */
export function draftOf(name: string, subject: string, previewText: string, list: EditorSection[]): OneOffDraft {
	return { name, subject, previewText, sections: list.map((entry) => entry.section) };
}

/** Whether two drafts would save the same. */
export function sameDraft(a: OneOffDraft, b: OneOffDraft): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The email as it arrives; `marks` draws it for typing into (preview-editing.ts), never for sending. */
export function previewOf(draft: OneOffDraft, frame: EmailFrame, { marks = false } = {}) {
	return renderOneOffEmail(draft, { ...frame, marks });
}

const STATUS: Record<OneOffStatus, { label: string; tone: StatusTone }> = {
	draft: { label: "Draft", tone: "neutral" },
	scheduled: { label: "Scheduled", tone: "info" },
	sending: { label: "Sending", tone: "info" },
	sent: { label: "Sent", tone: "success" },
	failed: { label: "Didn't send", tone: "danger" },
};

export function statusBadge(status: OneOffStatus): { label: string; tone: StatusTone } {
	return STATUS[status] || STATUS.draft;
}

/** Why "Send me a test" can't be pressed, or "" when it can. */
export function oneOffTestBlocked({
	saved,
	dirty,
	mailchimp,
	signedIn,
	notReady,
}: {
	saved: boolean;
	dirty: boolean;
	mailchimp: boolean;
	signedIn: boolean;
	notReady: string;
}): string {
	if (!mailchimp) return "Mailchimp not connected here";
	if (!signedIn) return "Sign in with Google first";
	if (!saved || dirty) return "Save first";
	return notReady;
}

/**
 * Why "Send to the list" can't be pressed, or "" when it can. Only production
 * ops reaches the list, and only an admin sends; it goes as it's saved.
 */
export function oneOffSendBlocked({
	status,
	saved,
	dirty,
	audience,
	admin,
	notReady,
}: {
	status: OneOffStatus | null;
	saved: boolean;
	dirty: boolean;
	audience: boolean;
	admin: boolean;
	notReady: string;
}): string {
	if (status === "sent" || status === "sending") return "Already sent";
	if (status === "scheduled") return "Scheduled: it goes by itself";
	if (!audience) return "Only production ops sends to the list";
	if (!admin) return "Admins only";
	if (!saved || dirty) return "Save first";
	return notReady;
}

/** Why it can't go anywhere yet (a subject, and something in it), as the server says it. */
export function notReady(draft: OneOffDraft): string {
	return oneOffNotReady(draft);
}

/** Paths of the Write tab. */
/** An email's page, or with no id the Email page's first tab, where the one-off cards are. */
export const writePath = (id?: number | string) => (id === undefined ? "/email" : `/email/write/${id}`);
