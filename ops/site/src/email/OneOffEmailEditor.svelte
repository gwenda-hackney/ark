<script lang="ts">
	/**
	 * A one-off email (#348): its name (ops' own), its subject and preview line, then its sections
	 * between the fixed logo and foot, with the email as it arrives beside
	 * them, drawn live by the same renderer Mailchimp gets
	 * (shared/email/one-off.js). The same editor card as an event's or a
	 * menu's (EditorShell). /email/write/new starts one; Save email keeps it
	 * as a draft; Send me a test sends the saved one to your own address.
	 * Sent or scheduled ones open read-only.
	 */
	import { onDestroy } from "svelte";
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
		type WeeklyEmailAccess,
	} from "./email-api";
	import EmailPreview from "./EmailPreview.svelte";
	import OneOffSectionCard from "./OneOffSectionCard.svelte";
	import { ONE_OFF_HELP } from "./one-off-help";
	import {
		SECTION_CHOICES,
		addSection,
		draftOf,
		emailName,
		editorSections,
		moveSection,
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
	const rendered = $derived(frame ? previewOf(draft, frame) : null);
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
		saved = draftOf(name, subject, previewText, sections);
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
				saved = draft;
				toast.ok("Email saved as a draft.");
				onchanged?.();
				navigate(writePath(made.id), { replace: true, force: true });
				return;
			}
			const { email: next } = await saveOneOffEmail(emailId, draft);
			email = next;
			// Keep the editor's own sections (and their keys); only what was cleaned changes.
			if (sameDraft(draftOf(next.name, next.subject, next.previewText, editorSections(next.sections)), draft)) saved = draft;
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

	async function upload(entry: EditorSection, file: File) {
		uploading = entry.key;
		try {
			const { assetId } = await uploadEmailImage(file);
			if (entry.section.kind === "image") {
				const index = sections.findIndex((other) => other.key === entry.key);
				if (index >= 0 && sections[index].section.kind === "image") {
					sections[index].section = { ...sections[index].section, assetId } as EditorSection["section"];
				}
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "The image didn't upload.");
		} finally {
			uploading = null;
		}
	}

	function add(kind: SectionKind) {
		sections = addSection(sections, kind);
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

	const heading = $derived(emailName({ name, subject }) || (isNew ? "New email" : "No name"));
	const subtitle = $derived(
		email && !isNew
			? [`Changed ${sentLine(email.updatedAt)}`, email.updatedBy ? `by ${email.updatedBy}` : ""].filter(Boolean).join(" ")
			: "Write it, save it, send yourself a test.",
	);
	const badge = $derived(email ? statusBadge(email.status) : statusBadge("draft"));
</script>

{#snippet kicker()}
	<p class="eyebrow">Email</p>
	<Badge tone={badge.tone} label={isNew ? "New" : badge.label} />
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
		<div class="tab-body split">
			<div class="form">
				<FormSection title="Email" description={editable ? "Its name here, and what the inbox shows." : "Sent or scheduled: it can't be changed."}>
					<Field class="span-12" label="Name" for="email-name" optional hint="What ops calls it, on its card. The list never sees it.">
						<TextField id="email-name" size="sm" bind:value={name} maxlength={80} disabled={!editable} placeholder="New Year's Eve promo" autocomplete="off" />
					</Field>
					<Field class="span-12" label="Subject" for="email-subject" required>
						<TextField id="email-subject" size="sm" bind:value={subject} maxlength={150} disabled={!editable} placeholder="New Year's Eve at Gwenda" autocomplete="off" />
					</Field>
					<Field class="span-12" label="Preview line" for="email-preview" optional hint="Shown after the subject in most inboxes.">
						<TextField id="email-preview" size="sm" bind:value={previewText} maxlength={200} disabled={!editable} placeholder="Doors at 9, music till late" autocomplete="off" />
					</Field>
				</FormSection>

				<FormSection title="Sections" description="Between the logo and the foot, in this order." help="What goes in it">
					<div class="span-12 sections">
						<div class="fixed">Logo · Hackney Wick</div>
						{#each sections as entry, index (entry.key)}
							<OneOffSectionCard
								bind:section={entry.section}
								id={`section-${entry.key}`}
								{index}
								count={sections.length}
								{frame}
								disabled={!editable || saving}
								uploading={uploading === entry.key}
								onmove={(by) => (sections = moveSection(sections, index, by))}
								onremove={() => (sections = removeSection(sections, index))}
								onfile={(file) => void upload(entry, file)}
							/>
						{:else}
							<p class="empty">No sections yet. Add one below.</p>
						{/each}
						<div class="fixed">Foot · links, unsubscribe, address</div>
						<div class="add" role="group" aria-label="Add a section">
							<span class="add-label">Add</span>
							{#each SECTION_CHOICES as choice (choice.kind)}
								<Button
									variant="outline"
									size="sm"
									type="button"
									disabled={!editable || saving || sections.length >= MAX_SECTIONS}
									reason={!editable ? "Sent or scheduled" : sections.length >= MAX_SECTIONS ? `${MAX_SECTIONS} sections at most` : undefined}
									onclick={() => add(choice.kind)}
								>
									{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
									{choice.label}
								</Button>
							{/each}
						</div>
					</div>
				</FormSection>
			</div>

			<div class="preview">
				<EmailPreview
					title="Preview"
					subtitle="As it arrives"
					email={rendered}
					blank="Nothing yet"
					frameHeight="min(44rem, calc(100dvh - 21rem))"
					note={frame ? `Links to ${frame.site.origin} · Gmail's fonts (Apple Mail shows the website's)` : ""}
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

<style>
	.tab-body {
		position: relative;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
	}
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(22rem, 1fr);
		gap: var(--space-5, 1.5rem);
		align-items: start;
	}
	.form {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
	}
	.form > :global(.form-section:first-child) {
		padding-top: 0;
		border-top: 0;
	}
	.preview {
		position: sticky;
		top: 0;
		min-width: 0;
	}
	.sections {
		display: grid;
		gap: var(--space-2);
	}
	.fixed {
		padding: var(--space-2) var(--space-3);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		text-align: center;
	}
	.empty {
		margin: 0;
		padding: var(--space-3);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		text-align: center;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding-top: var(--space-1);
	}
	.add-label {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	@media (max-width: 1100px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
		.preview {
			position: static;
		}
	}
	@media (max-width: 900px) {
		.tab-body {
			padding: var(--space-4) max(var(--page-gutter), 1.125rem) max(var(--page-gutter), 1.125rem);
		}
	}
</style>
