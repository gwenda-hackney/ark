/**
 * What the Write tab and the one-off email editor (#348) say and do with a
 * draft, kept out of the components so it's tested: the section list's
 * moves, the status badge, the preview built from the shared renderer.
 */
import { oneOffNotReady, renderOneOffEmail } from "../../../../shared/email/one-off.js";
import { SECTION_KINDS } from "../../../../shared/email/sections.js";
import type { EmailFrame, OneOffDraft, OneOffSection, OneOffStatus } from "./email-api";
import type { StatusTone } from "./email-view";

export type SectionKind = OneOffSection["kind"];

/** The kinds the editor offers, in order, with their short names. */
export const SECTION_CHOICES: { kind: SectionKind; label: string }[] = [
	{ kind: "image", label: "Image" },
	{ kind: "heading", label: "Heading" },
	{ kind: "copy", label: "Copy" },
	{ kind: "button", label: "Button" },
	{ kind: "booking", label: "Book a table" },
];

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
	// A button saved before it had a look is a link.
	return sections.map((section) =>
		keyed(section.kind === "button" ? { ...section, look: section.look === "outline" ? "outline" : "link" } : { ...section }),
	);
}

export function addSection(list: EditorSection[], kind: SectionKind): EditorSection[] {
	return [...list, keyed(blankSection(kind))];
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

/** The email as it would arrive, for the live preview. */
export function previewOf(draft: OneOffDraft, frame: EmailFrame) {
	return renderOneOffEmail(draft, frame);
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
