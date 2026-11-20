<script lang="ts">
	/**
	 * A one-off email (#348): its name (ops' own), its subject and preview line, then its sections
	 * between the fixed logo and foot, with the email as it arrives beside
	 * them, drawn live by the same renderer Mailchimp gets
	 * (shared/email/one-off.js). Its headings and text are typed straight into
	 * that email (preview-editing.ts, WordsToolbar for Bold and Link): while
	 * someone types there, the preview keeps still and the sections follow it. The same editor card as an event's or a
	 * menu's (EditorShell). /email/write/new starts one; Save email keeps it
	 * as a draft; Send me a test sends the saved one to your own address.
	 * Sent or scheduled ones open read-only.
	 */
	import { onDestroy } from "svelte";
	import { attachEditing, focusWords, scrollToPart, showSelected, type WordsFocus } from "./preview-editing";
	import EmailSidePanel from "./EmailSidePanel.svelte";
	import PictureChooser from "./PictureChooser.svelte";
	import EventChooser from "./EventChooser.svelte";
	import { Badge, Button, ConfirmDialog, EditorShell, EmptyState, Field, FormSection, HelpDrawer, Skeleton, TextField } from "../ui";
	import { Icon } from "../app/shell";
	import type { AuthMe } from "../app/api";
	import { leaveEditor, navigate, parseShellPath } from "../app/nav";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { provideHelp } from "../ui/help.svelte";
	import { toast } from "../ui/toast.svelte";
	import { beginLeave, clearUnsavedGuard, setUnsavedGuard, takeBlockedNav } from "../ui/unsaved.svelte";
	import { MAX_SECTIONS } from "../../../../shared/email/sections.js";
	import {
		createOneOffEmail,
		deleteOneOffEmail,
		getOneOffEmail,
		listOneOffEmails,
		saveOneOffEmail,
		getWeeklyEmailAudience,
		sendOneOffTest,
		sendOneOffToList,
		uploadEmailImage,
		type EmailFrame,
		type OneOffDraft,
		type OneOffEmail,
		type OneOffSection,
		type EventCard,
		type RowCell,
		type WeeklyEmailAccess,
	} from "./email-api";
	import EmailPreview from "./EmailPreview.svelte";
	import { ONE_OFF_HELP } from "./one-off-help";
	import {
		draftOf,
		emailName,
		editorSections,
		insertSection,
		moveSectionTo,
		swapCells,
		notReady,
		oneOffSendBlocked,
		oneOffTestBlocked,
		previewOf,
		removeSection,
		sameDraft,
		statusBadge,
		writePath,
		type EditorSection,
		type SectionKind,
	} from "./one-off-view";
	import { sentLine } from "./email-view";

	let {
		path,
		open = true,
		me,
		onchanged,
	}: {
		path: string;
		/** Whether it shows (the Write tab keeps it mounted so it can zoom in and out). */
		open?: boolean;
		me: AuthMe;
		/** Something was saved or deleted: the list is out of date. */
		onchanged?: () => void;
	} = $props();

	const route = $derived(parseShellPath(path));
	const isNew = $derived(Boolean(route.isNew));
	const emailId = $derived(route.isNew ? 0 : Number(route.slug) || 0);

	const help = provideHelp("Email", ONE_OFF_HELP);

	let email = $state<OneOffEmail | null>(null);
	let frame = $state<EmailFrame | null>(null);
	let access = $state<WeeklyEmailAccess | null>(null);
	let name = $state("");
	let subject = $state("");
	let previewText = $state("");
	let sections = $state<EditorSection[]>([]);
	let saved = $state<OneOffDraft>({ name: "", subject: "", previewText: "", sections: [] });
	let loading = $state(true);
	let error = $state("");
	let saving = $state(false);
	let testing = $state(false);
	let deleting = $state(false);
	let uploading = $state<string | null>(null);
	let discardOpen = $state(false);
	let deleteOpen = $state(false);
	let sendOpen = $state(false);
	let sendingToList = $state(false);
	/** How many are on the list, for the confirm: asked for when it opens. */
	let listSize = $state<number | null>(null);

	const draft = $derived(draftOf(name, subject, previewText, sections));
	const dirty = $derived(!loading && !error && !sameDraft(draft, saved));
	const editable = $derived(isNew || email?.status === "draft");
	const canSave = $derived(editable && !saving && !uploading && (isNew || dirty));
	// Typing in the preview: its document, where the typing is, and whether a link's address is being typed.
	let wordsDoc = $state<Document | null>(null);
	let wordsAt = $state<WordsFocus | null>(null);
	let linking = $state(false);
	const typing = $derived(Boolean(wordsAt) || linking);
	// What the preview shows: the draft, except it keeps still while someone types into it
	// (redrawing would lose their place); it catches up when they stop.
	let shown = $state<OneOffDraft | null>(null);
	$effect(() => {
		// A copy, not the draft's live sections: those change under the typing.
		const next = $state.snapshot(draft) as OneOffDraft;
		if (!typing) shown = next;
	});
	const rendered = $derived(frame && shown ? previewOf(shown, frame, { marks: true }) : null);

	// What's picked in the email (by key, so it follows a move), where a + is adding, and the picture chooser.
	let selectedKey = $state<string | null>(null);
	let insertingAt = $state<number | null>(null);
	/** The picture chooser is open for this part (and, for two pictures, this one of them). */
	let choosingFor = $state<{ key: string; slot: number } | null>(null);
	/** The event chooser is open for this part. */
	let eventFor = $state<string | null>(null);
	/** Words just added: the typing goes into them once the email is drawn again. */
	let focusKey: string | null = null;
	const selectedIndex = $derived(selectedKey ? sections.findIndex((entry) => entry.key === selectedKey) : -1);
	const selected = $derived(selectedIndex >= 0 ? sections[selectedIndex] : null);
	$effect(() => {
		if (wordsDoc) showSelected(wordsDoc, selectedIndex >= 0 ? selectedIndex : null, insertingAt);
	});

	function typedInto(doc: Document) {
		wordsDoc = doc;
		wordsAt = null;
		attachEditing(doc, editable && !saving, {
			ontext(index, kind, text) {
				const entry = sections[index];
				if (entry && entry.section.kind === kind) entry.section.text = text;
			},
			onfocus(focus) {
				wordsAt = focus;
			},
			onselect(index) {
				selectedKey = sections[index]?.key ?? null;
				insertingAt = null;
			},
			oninsert(at) {
				insertingAt = at;
				selectedKey = null;
			},
			onmove(from, at) {
				selectedKey = sections[from]?.key ?? selectedKey;
				sections = moveSectionTo(sections, from, at);
			},
			oncells(from, to) {
				sections = swapCells(sections, from, to);
				selectedKey = sections[to.section]?.key ?? selectedKey;
			},
		});
		showSelected(doc, selectedIndex >= 0 ? selectedIndex : null, insertingAt);
		const typeInto = focusKey ? sections.findIndex((entry) => entry.key === focusKey) : -1;
		focusKey = null;
		if (typeInto >= 0) focusWords(doc, typeInto);
	}

	/** A kind chosen for the + : it goes there, picked; words get the typing, a picture opens the chooser. */
	function choose(kind: SectionKind) {
		if (insertingAt === null) return;
		if (sections.length >= MAX_SECTIONS) {
			toast.error(`${MAX_SECTIONS} parts at most.`);
			return;
		}
		const added = insertSection(sections, insertingAt, kind);
		sections = added.list;
		insertingAt = null;
		selectedKey = added.key;
		if (kind === "heading" || kind === "copy") focusKey = added.key;
		if (kind === "image") choosingFor = { key: added.key, slot: 0 };
		if (kind === "event") eventFor = added.key;
	}

	/** Picks a part from the list beside the email, and brings it into view. */
	function pickPart(index: number) {
		selectedKey = sections[index]?.key ?? null;
		insertingAt = null;
		if (wordsDoc) scrollToPart(wordsDoc, index);
	}

	function setCell(cell: number, value: RowCell) {
		const entry = selected;
		if (entry?.section.kind !== "row") return;
		entry.section.cells = entry.section.cells.map((other, at) => (at === cell ? value : other));
	}

	function removeSelected() {
		if (selectedIndex < 0) return;
		sections = removeSection(sections, selectedIndex);
		selectedKey = null;
	}

	function changeSelected(patch: Partial<OneOffSection>) {
		if (selected) Object.assign(selected.section, patch);
	}

	/** A picture from the library, for the section the chooser opened for. */
	function pickEvent(card: EventCard) {
		const entry = sections.find((other) => other.key === eventFor);
		eventFor = null;
		if (entry?.section.kind === "event") Object.assign(entry.section, card);
	}

	function pickPicture(assetId: string, alt: string) {
		const target = choosingFor;
		choosingFor = null;
		if (target) setPicture(target.key, target.slot, assetId, alt);
	}

	/** Puts a picture in a part: a Picture, or a Row's cell `slot`. */
	function setPicture(key: string, slot: number, assetId: string, alt: string) {
		const entry = sections.find((other) => other.key === key);
		if (entry?.section.kind === "image") Object.assign(entry.section, { assetId, alt: entry.section.alt || alt });
		if (entry?.section.kind === "row") {
			entry.section.cells = entry.section.cells.map((cell, at) =>
				at === slot ? { kind: "picture", assetId, alt: (cell.kind === "picture" && cell.alt) || alt } : cell,
			);
		}
	}

	async function uploadPicture(file: File) {
		const target = choosingFor;
		choosingFor = null;
		if (!target) return;
		uploading = target.key;
		try {
			const { assetId } = await uploadEmailImage(file);
			setPicture(target.key, target.slot, assetId, "");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "The picture didn't upload.");
		} finally {
			uploading = null;
		}
	}
	const testReason = $derived(
		oneOffTestBlocked({
			saved: Boolean(email),
			dirty,
			mailchimp: Boolean(access?.mailchimp),
			signedIn: Boolean(me.email),
			notReady: notReady(saved),
		}),
	);
	const sendReason = $derived(
		oneOffSendBlocked({
			status: email?.status ?? null,
			saved: Boolean(email),
			dirty,
			audience: Boolean(access?.audience),
			admin: Boolean(me.isAdmin),
			notReady: notReady(saved),
		}),
	);
	const deleteReason = $derived(isNew ? "Not saved yet" : !editable ? "Sent or scheduled" : undefined);

	function fill(source: OneOffDraft) {
		name = source.name || "";
		subject = source.subject;
		previewText = source.previewText;
		sections = editorSections(source.sections);
		// A copy: the draft's sections are the ones being edited, and the saved ones must not change with them.
		saved = $state.snapshot(draftOf(name, subject, previewText, sections)) as OneOffDraft;
	}

	async function load(id: number, fresh: boolean) {
		loading = true;
		error = "";
		try {
			if (fresh) {
				const data = await listOneOffEmails();
				frame = data.frame;
				access = data.access;
				email = null;
				fill({ name: "", subject: "", previewText: "", sections: [] });
				setCrumbLeaf("New email");
				return;
			}
			if (!id) throw new Error("That email isn't here.");
			const data = await getOneOffEmail(id);
			email = data.email;
			frame = data.frame;
			access = data.access;
			fill(data.email);
			setCrumbLeaf(emailName(data.email) || "Email");
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load this email.";
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) void load(emailId, isNew);
		else setCrumbLeaf("");
	});

	async function save() {
		if (!canSave) return;
		saving = true;
		try {
			if (isNew) {
				const { email: made } = await createOneOffEmail(draft);
				saved = $state.snapshot(draft) as OneOffDraft;
				toast.ok("Email saved as a draft.");
				onchanged?.();
				navigate(writePath(made.id), { replace: true, force: true });
				return;
			}
			const { email: next } = await saveOneOffEmail(emailId, draft);
			email = next;
			// Keep the editor's own sections (and their keys); only what was cleaned changes.
			if (sameDraft(draftOf(next.name, next.subject, next.previewText, editorSections(next.sections)), draft)) saved = $state.snapshot(draft) as OneOffDraft;
			else fill(next);
			setCrumbLeaf(emailName(next) || "Email");
			toast.ok("Email saved.");
			onchanged?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the email.");
		} finally {
			saving = false;
		}
	}

	async function sendTest() {
		if (!email || testReason || testing) return;
		testing = true;
		try {
			const sent = await sendOneOffTest(email.id);
			toast.ok(`Test sent to ${sent.sentTo}.${sent.warning ? ` ${sent.warning}` : ""}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "The test didn't send.");
		} finally {
			testing = false;
		}
	}

	async function openSend() {
		if (sendReason || sendingToList) return;
		listSize = null;
		sendOpen = true;
		try {
			listSize = (await getWeeklyEmailAudience()).audience.memberCount;
		} catch {
			listSize = null;
		}
	}

	async function sendToList() {
		sendOpen = false;
		if (!email || sendReason || sendingToList) return;
		sendingToList = true;
		try {
			const { email: sent } = await sendOneOffToList(email.id);
			email = sent;
			fill(sent);
			toast.ok(sent.status === "sent" ? `Sent to ${sent.recipients.toLocaleString("en-GB")} people.` : "It's on its way.");
			onchanged?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "It didn't send.");
			if (email) void load(email.id, false);
		} finally {
			sendingToList = false;
		}
	}

	async function remove() {
		deleteOpen = false;
		if (!email || deleting) return;
		deleting = true;
		try {
			await deleteOneOffEmail(email.id);
			toast.ok("Email deleted.");
			onchanged?.();
			beginLeave();
			navigate(writePath(), { replace: true, force: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete the email.");
		} finally {
			deleting = false;
		}
	}

	function back() {
		leaveEditor(writePath());
	}

	$effect(() => {
		setUnsavedGuard(open && dirty && !saving, () => (discardOpen = true));
	});

	$effect(() => {
		if (!open || typeof window === "undefined") return;
		function onKey(e: KeyboardEvent) {
			if (e.key !== "Escape" || e.defaultPrevented || saving || discardOpen || deleteOpen || sendOpen) return;
			if (document.querySelector("[role=dialog], [role=menu], dialog[open]")) return;
			e.preventDefault();
			back();
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	$effect(() => {
		if (!open || !dirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	onDestroy(() => {
		clearUnsavedGuard();
		setCrumbLeaf("");
	});

	function keepEditing() {
		discardOpen = false;
		takeBlockedNav();
	}

	function discardAndLeave() {
		discardOpen = false;
		beginLeave();
		const pending = takeBlockedNav();
		if (pending?.path) navigate(pending.path, { force: true, replace: pending.replace });
	}

	const heading = $derived(error ? "Email" : emailName({ name, subject }) || (isNew ? "New email" : "No name"));
	const subtitle = $derived(
		email && !isNew
			? [`Changed ${sentLine(email.updatedAt)}`, email.updatedBy ? `by ${email.updatedBy}` : ""].filter(Boolean).join(" ")
			: "Write it, save it, send yourself a test.",
	);
	const badge = $derived(email ? statusBadge(email.status) : statusBadge("draft"));
</script>

{#snippet kicker()}
	<p class="eyebrow">Email</p>
	{#if !error}<Badge tone={badge.tone} label={isNew ? "New" : badge.label} />{/if}
{/snippet}

{#snippet testButton()}
	<Button
		variant="outline"
		size="sm"
		type="button"
		disabled={Boolean(testReason) || testing || saving}
		reason={testReason || undefined}
		busy={testing}
		onclick={() => void sendTest()}
	>
		{#snippet icon()}<Icon name="send" size={14} />{/snippet}
		{testing ? "Sending…" : "Send me a test"}
	</Button>
	<Button
		size="sm"
		type="button"
		disabled={Boolean(sendReason) || sendingToList || saving || testing}
		reason={sendReason || undefined}
		busy={sendingToList}
		onclick={() => void openSend()}
	>
		{#snippet icon()}<Icon name="send" size={14} />{/snippet}
		{sendingToList ? "Sending…" : "Send to the list…"}
	</Button>
{/snippet}

<EditorShell
	{open}
	backLabel="Write"
	onclose={back}
	{dirty}
	busy={saving}
	{kicker}
	{heading}
	placeholder={!emailName({ name, subject })}
	{subtitle}
	actions={{
		saveLabel: "Save email",
		saving,
		disabled: !canSave || deleting || Boolean(error) || loading,
		dirty,
		onsave: () => void save(),
		end: testButton,
		overflow: [
			{
				label: "Delete email",
				tone: "destructive",
				disabled: Boolean(deleteReason) || deleting,
				reason: deleteReason,
				onselect: () => (deleteOpen = true),
			},
		],
	}}
>
	{#if error}
		<div class="tab-body">
			<EmptyState tone="error" title="Couldn't load this email" text={error}>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void load(emailId, isNew)}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else if loading && !frame}
		<div class="tab-body"><Skeleton rows={5} lines={1} label="Loading the email…" /></div>
	{:else}
		<div class="tab-body">
			<FormSection title="Email" description={editable ? "Its name here, and what the inbox shows. Change the email itself by clicking it below." : "Sent or scheduled: it can't be changed."}>
				<Field class="span-4" label="Name" for="email-name" optional hint="What ops calls it. The list never sees it.">
					<TextField id="email-name" size="sm" bind:value={name} maxlength={80} disabled={!editable} placeholder="New Year's Eve promo" autocomplete="off" />
				</Field>
				<Field class="span-4" label="Subject" for="email-subject" required>
					<TextField id="email-subject" size="sm" bind:value={subject} maxlength={150} disabled={!editable} placeholder="New Year's Eve at Gwenda" autocomplete="off" />
				</Field>
				<Field class="span-4" label="Preview line" for="email-preview" optional hint="Shown after the subject in most inboxes.">
					<TextField id="email-preview" size="sm" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="Doors at 9, music till late" autocomplete="off" />
				</Field>
			</FormSection>

			<div class="canvas">
				<EmailPreview
					title="The email"
					subtitle={editable ? "Click any part to change it; drag one by its gold handle to move it" : "As it went"}
					email={rendered}
					blank="Nothing yet"
					frameHeight="max(32rem, calc(100dvh - 24rem))"
					onframe={typedInto}
					note={frame ? `Links to ${frame.site.origin} · Gmail's fonts (Apple Mail shows the website's)` : ""}
				/>
				<EmailSidePanel
					doc={wordsDoc}
					words={wordsAt}
					{editable}
					bind:linking
					{sections}
					index={selectedIndex}
					inserting={insertingAt}
					uploading={Boolean(selected && uploading === selected.key)}
					onpick={pickPart}
					oninsert={(at) => {
						insertingAt = at;
						selectedKey = null;
					}}
					onremove={removeSelected}
					onchange={changeSelected}
					onchoose={choose}
					oncancel={() => (insertingAt = null)}
					onpicture={(slot = 0) => (choosingFor = selectedKey ? { key: selectedKey, slot } : null)}
					onevent={() => (eventFor = selectedKey)}
					oncell={setCell}
					onclose={() => {
						selectedKey = null;
						insertingAt = null;
					}}
				/>
			</div>
		</div>
	{/if}
</EditorShell>

<ConfirmDialog
	open={discardOpen}
	title="Discard unsaved changes?"
	message="You've changed this email and haven't saved it. The changes will be lost."
	action="Discard"
	cancelLabel="Keep editing"
	oncancel={keepEditing}
	onconfirm={discardAndLeave}
/>
<ConfirmDialog
	open={sendOpen}
	title="Send it to the mailing list?"
	message={`"${email?.subject || ""}" goes to ${listSize === null ? "everyone" : `${listSize.toLocaleString("en-GB")} people`} on the mailing list, now, as it's saved. It can't be taken back.`}
	action={listSize === null ? "Send" : `Send to ${listSize.toLocaleString("en-GB")}`}
	oncancel={() => (sendOpen = false)}
	onconfirm={() => void sendToList()}
/>
<ConfirmDialog
	open={deleteOpen}
	title="Delete this email?"
	message="The draft goes for good. This can't be undone."
	action="Delete"
	oncancel={() => (deleteOpen = false)}
	onconfirm={() => void remove()}
/>

<HelpDrawer {help} />

<EventChooser open={eventFor !== null} onclose={() => (eventFor = null)} onpick={pickEvent} />
<PictureChooser open={choosingFor !== null} onclose={() => (choosingFor = null)} onpick={pickPicture} onupload={uploadPicture} />

<style>
	.tab-body {
		position: relative;
		display: grid;
		gap: var(--space-4);
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
	}
	.tab-body > :global(.form-section:first-child) {
		padding-top: 0;
		border-top: 0;
	}
	.canvas {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
		gap: var(--space-4);
		align-items: start;
		min-width: 0;
	}
	/* The list and the picked part stay in sight while a long email scrolls. */
	.canvas > :global(.side) {
		position: sticky;
		top: 0;
	}
	@media (max-width: 900px) {
		.canvas {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 900px) {
		.tab-body {
			padding: var(--space-4) max(var(--page-gutter), 1.125rem) max(var(--page-gutter), 1.125rem);
		}
	}
</style>
