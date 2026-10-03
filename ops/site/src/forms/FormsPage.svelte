<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
		Button,
		Confirm,
		ConfirmDialog,
		EditorBackBar,
		EmptyState,
		Field,
		FilterBar,
		FilterField,
		NativeSelect,
		PageHeader,
		Skeleton,
		TextField,
	} from "../ui";
	import { decisionBadge } from "../ui/badge";
	import {
		getFormSubmissions,
		resendFormEmail,
		setFormArtist,
		setFormDecision,
		type FormDecision,
		type FormEmailKind,
		type FormSubmission,
	} from "../app/api";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { easeOut, fadeMs, flyMs } from "../ui/motion";
	import { navigate, parseShellPath } from "../app/nav";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";
	import { formatWhen } from "../website/web-metrics";
	import FormsGrid from "./FormsGrid.svelte";
	import FormsCards from "./FormsCards.svelte";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";

	let { path = "/forms" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	/** Phones get cards; the table needs a desk. */
	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	const openId = $derived(route.page === "forms" ? route.slug : null);

	let rows = $state<FormSubmission[]>([]);
	let loading = $state(true);
	let error = $state("");
	let query = $state("");
	let formFilter = $state("");
	let sending = $state<FormEmailKind | null>(null);
	let mailNote = $state("");
	let mailError = $state("");
	let deciding = $state(false);
	let decisionError = $state("");
	/** Ops' copy of the artist name and link, shown filled with what they sent. */
	let artistNameDraft = $state("");
	let artistLinkDraft = $state("");
	let savingArtist = $state(false);
	let artistNote = $state("");
	let artistError = $state("");
	const confirm = new Confirm();

	const EMAILS: { kind: FormEmailKind; label: string; field: "notifySentAt" | "receiptSentAt" }[] = [
		{ kind: "notify", label: "Team notification", field: "notifySentAt" },
		{ kind: "receipt", label: "Receipt to applicant", field: "receiptSentAt" },
	];

	const selected = $derived(rows.find((row) => row.id === openId) ?? null);

	const forms = $derived.by(() => {
		const titles = new Map<string, string>();
		for (const row of rows) {
			const key = row.formSlug || row.formTitle;
			if (!titles.has(key)) titles.set(key, row.formTitle || key);
		}
		return [...titles.entries()].sort((a, b) => a[1].localeCompare(b[1]));
	});

	const formOptions = $derived([
		{ value: "", label: "All forms" },
		...forms.map(([value, label]) => ({ value, label })),
	]);

	const formChips = $derived(
		formFilter
			? [{ key: "form", label: formOptions.find((row) => row.value === formFilter)?.label || "Form", onremove: () => (formFilter = "") }]
			: [],
	);

	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return rows.filter((row) => {
			const formKey = row.formSlug || row.formTitle;
			if (formFilter && formKey !== formFilter) return false;
			if (!needle) return true;
			const haystack = [
				row.name,
				row.email,
				row.formTitle,
				row.status,
				...row.answers.map((answer) => `${answer.label} ${answer.value}`),
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(needle);
		});
	});

	/** Answers only. Name and email sit in the header. */
	const detailAnswers = $derived(
		selected ? selected.answers.filter((answer) => answer.value.trim()) : [],
	);

	const statusTone = $derived.by(() => {
		const status = selected?.status.toLowerCase() ?? "";
		if (status === "verified") return "success";
		if (status === "pending") return "warning";
		return "neutral";
	});

	const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

	/** Split an answer into text and link parts so music links open from ops. */
	function linkParts(value: string): { text: string; href?: string }[] {
		return value
			.split(URL_PATTERN)
			.filter(Boolean)
			.map((part) => (/^https?:\/\//.test(part) ? { text: part, href: part } : { text: part }));
	}

	function closeDetail() {
		// Unsaved guest-artist edits are caught by the guard below.
		navigate("/forms");
	}

	$effect(() => {
		void openId;
		mailNote = "";
		mailError = "";
		artistNote = "";
		artistError = "";
		const row = rows.find((item) => item.id === openId);
		artistNameDraft = row?.artistName || row?.submitted?.name || "";
		artistLinkDraft = row?.artistLink || row?.submitted?.link || "";
	});

	const artistDirty = $derived(
		Boolean(selected) &&
			(artistNameDraft.trim() !== (selected?.artistName || selected?.submitted?.name || "") ||
				artistLinkDraft.trim() !== (selected?.artistLink || selected?.submitted?.link || "")),
	);

	// Unsaved guest-artist edits: ask before leaving, like the other editors,
	// and the shell's saving pill knows.
	$effect(() => {
		setUnsavedGuard(artistDirty, () => {
			const next = takeBlockedNav();
			if (!next) return;
			void confirm
				.ask({
					title: "Discard unsaved changes?",
					message: "The guest artist name or link you changed hasn't been saved.",
					action: "Discard",
					cancel: "Keep editing",
				})
				.then((ok) => {
					if (!ok) return;
					beginLeave();
					navigate(next.path, { replace: next.replace, force: true });
				});
		});
	});

	$effect(() => {
		if (!artistDirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	/** Save ops' copy. Matching what they sent stores nothing, so it follows their answers. */
	async function saveArtist(row: FormSubmission) {
		if (savingArtist) return;
		savingArtist = true;
		artistNote = "";
		artistError = "";
		const sent = row.submitted || { name: "", link: "" };
		const name = artistNameDraft.trim() === sent.name ? "" : artistNameDraft.trim();
		const link = artistLinkDraft.trim() === sent.link ? "" : artistLinkDraft.trim();
		try {
			const saved = await setFormArtist(row.id, { name, link });
			rows = rows.map((item) =>
				item.formSlug === row.formSlug && item.email === row.email
					? { ...item, artistName: saved.artistName, artistLink: saved.artistLink }
					: item,
			);
			artistNameDraft = saved.artistName || sent.name;
			artistLinkDraft = saved.artistLink || sent.link;
			artistNote = saved.eventsUpdated
				? `Saved. ${saved.eventsUpdated === 1 ? "1 upcoming event" : `${saved.eventsUpdated} upcoming events`} updated too; they go on the website with Update website.`
				: "Saved.";
		} catch (err) {
			artistError = err instanceof Error ? err.message : "Could not save that.";
		} finally {
			savingArtist = false;
		}
	}

	async function resend(row: FormSubmission, kind: FormEmailKind) {
		if (sending) return;
		sending = kind;
		mailNote = "";
		mailError = "";
		try {
			const result = await resendFormEmail(row.id, kind);
			if (result.dryRun) {
				mailNote = "Dry run: mail is not configured here, so nothing was sent.";
				return;
			}
			const field = kind === "notify" ? "notifySentAt" : "receiptSentAt";
			const sentAt = result.sentAt || new Date().toISOString();
			rows = rows.map((item) => (item.id === row.id ? { ...item, [field]: sentAt } : item));
			mailNote = result.warning ? `Sent, but ${result.warning.toLowerCase()}` : "Sent.";
		} catch (err) {
			mailError = err instanceof Error ? err.message : "Could not resend.";
		} finally {
			sending = null;
		}
	}

	/** Approve or decline; it holds for every reply from the same address. */
	async function decide(row: FormSubmission, decision: FormDecision) {
		if (deciding) return;
		if (decision === "Declined") {
			const ok = await confirm.ask({
				title: `Decline ${personLabel(row)}?`,
				message:
					"They can't be picked as a guest artist. It holds for every reply from this address; you can approve them later. No email is sent.",
				action: "Decline",
			});
			if (!ok) return;
		}
		deciding = true;
		decisionError = "";
		try {
			await setFormDecision(row.id, decision);
			rows = rows.map((item) =>
				item.formSlug === row.formSlug && item.email === row.email ? { ...item, decision } : item,
			);
		} catch (err) {
			decisionError = err instanceof Error ? err.message : "Could not save that.";
		} finally {
			deciding = false;
		}
	}

	function personLabel(row: FormSubmission): string {
		return row.name || row.email || "Submission";
	}

	$effect(() => {
		setCrumbLeaf(selected ? personLabel(selected) : "");
	});

	onDestroy(() => {
		setCrumbLeaf("");
		clearUnsavedGuard();
	});

	onMount(() => {
		void (async () => {
			try {
				const data = await getFormSubmissions();
				rows = data.submissions || [];
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Could not load submissions.";
				error = message;
			} finally {
				loading = false;
			}
		})();
	});
</script>

{#snippet formFilterField()}
	<FilterField label="Form" for="forms-filter">
		<NativeSelect id="forms-filter" bind:value={formFilter} options={formOptions} size="sm" />
	</FilterField>
{/snippet}

<div class="forms-root">
	{#if openId}
		<div
			class="detail"
			in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
			out:fade={{ duration: fadeMs, easing: easeOut }}
		>
			<EditorBackBar label="Play applications" onback={closeDetail} />
			<div class="split">
				<article class="panel">
					<header class="panel-head">
						<div class="type-line">
							<Icon name="forms" size={14} />
							<p class="eyebrow">
								Play application{selected?.formTitle ? ` · ${selected.formTitle}` : ""}
							</p>
							{#if selected?.status}
								<Badge tone={statusTone} label={selected.status} />
							{/if}
							{#if selected?.decision}
								{@const decision = decisionBadge(selected.decision)}
								{#if decision}<Badge tone={decision.tone} label={decision.label} />{/if}
							{/if}
						</div>
						<div class="head-tools">
							{#if selected?.formSlug === "play"}
								{#if selected.decision !== "Approved"}
									<Button
										variant="primary"
										size="sm"
										type="button"
										disabled={deciding}
										title="Approved artists can be picked as an event's guest artist."
										onclick={() => void decide(selected, "Approved")}
									>
										Approve
									</Button>
								{/if}
								{#if selected.decision !== "Declined"}
									<Button
										variant="outline"
										size="sm"
										type="button"
										disabled={deciding}
										onclick={() => void decide(selected, "Declined")}
									>
										Decline
									</Button>
								{/if}
							{/if}
							{#if selected?.email}
								<Button
									variant="outline"
									size="sm"
									type="button"
									title={`Write to ${selected.email}`}
									onclick={() => (window.location.href = `mailto:${selected.email}`)}
								>
									Reply
								</Button>
							{/if}
							<Button
								class="close-btn"
								variant="ghost"
								size="sm"
								type="button"
								aria-label="Close"
								title="Close"
								onclick={closeDetail}
							>
								{#snippet icon()}
									<Icon name="close" size={16} />
								{/snippet}
							</Button>
						</div>
						<div class="title-name">
							<div class="name-line">
								<h1 class="title">{selected ? personLabel(selected) : "Submission"}</h1>
							</div>
							{#if selected?.email && selected.name}
								<a class="sub" href={`mailto:${selected.email}`}>{selected.email}</a>
							{/if}
						</div>
						{#if selected}
							<p class="head-note">
								{#if selected.submittedAt}
									<span>Applied {formatWhen(selected.submittedAt)}.</span>
								{/if}
								<span>
									{selected.current
										? "Latest reply from this address."
										: "An earlier reply. This address has a newer one."}
								</span>
							</p>
							{#if decisionError}<p class="error">{decisionError}</p>{/if}
						{/if}
					</header>

					<div class="body scrollbar-fade">
						{#if error}
							<p class="error">{error}</p>
						{:else if !loading && !selected}
							<p class="muted">That submission is not in the current list.</p>
						{:else if selected}
							<section class="details-board">
								<div class="details-main">
									<h2 class="section-title">Application</h2>
									{#if detailAnswers.length}
										<dl class="answers">
											{#each detailAnswers as answer (answer.key)}
												<div class="answer">
													<dt>{answer.label}</dt>
													<dd>
														{#each linkParts(answer.value) as part, index (index)}
															{#if part.href}
																<a href={part.href} target="_blank" rel="noopener noreferrer"
																	>{part.text}</a
																>
															{:else}
																{part.text}
															{/if}
														{/each}
													</dd>
												</div>
											{/each}
										</dl>
									{:else}
										<p class="muted">No answers beyond name and email.</p>
									{/if}
								</div>
								<aside class="details-side">
									{#if selected.submitted}
										<section class="card" aria-labelledby="form-artist-title">
											<h2 class="card-title" id="form-artist-title">Guest artist</h2>
											<p class="muted">
												How they appear when picked as an event's guest artist. Saving also updates upcoming events that
												still show the old name or link. Their application stays as they sent it.
											</p>
											<Field label="Artist name" for="form-artist-name" optional>
												<TextField
													id="form-artist-name"
													size="sm"
													bind:value={artistNameDraft}
													placeholder={selected.submitted.name || "Artist or DJ name"}
												/>
											</Field>
											<Field label="Instagram or website" for="form-artist-link" optional>
												<TextField
													id="form-artist-link"
													size="sm"
													inputmode="url"
													spellcheck="false"
													bind:value={artistLinkDraft}
													placeholder="@handle or website"
												/>
											</Field>
											<div class="artist-actions">
												<Button
													variant="outline"
													size="sm"
													type="button"
													disabled={!artistDirty || savingArtist}
													busy={savingArtist}
													onclick={() => void saveArtist(selected)}
												>
													Save
												</Button>
												{#if artistError}
													<p class="error">{artistError}</p>
												{:else if artistNote}
													<p class="muted">{artistNote}</p>
												{/if}
											</div>
										</section>
									{/if}
									<section class="card" aria-labelledby="form-emails-title">
										<h2 class="card-title" id="form-emails-title">Emails</h2>
										<ul class="emails">
											{#each EMAILS as email (email.kind)}
												{@const sentAt = selected[email.field]}
												<li>
													<span class="dot" class:sent={Boolean(sentAt)} aria-hidden="true"></span>
													<div class="email-copy">
														<span class="email-label">{email.label}</span>
														<span class={sentAt ? "sent-at" : "not-sent"}>
															{sentAt ? `Sent ${formatWhen(sentAt)}` : "Not sent"}
														</span>
													</div>
													<Button
														variant="outline"
														size="sm"
														type="button"
														disabled={sending !== null}
														busy={sending === email.kind}
														onclick={() => resend(selected, email.kind)}
													>
														{sentAt ? "Resend" : "Send"}
													</Button>
												</li>
											{/each}
										</ul>
										{#if mailError}
											<p class="error">{mailError}</p>
										{:else if mailNote}
											<p class="muted">{mailNote}</p>
										{/if}
									</section>
								</aside>
							</section>
						{/if}
					</div>
				</article>
			</div>
		</div>
	{:else}
		<div class="list">
			<PageHeader
				title="Play applications"
				subtitle="Artists who applied to play through the site. Latest reply for each address."
			>
				{#snippet toolbar()}
					<FilterBar
						bind:query
						placeholder="Search people"
						ariaLabel="Search submissions"
						searchCount={query ? visible.length : undefined}
						active={formFilter ? 1 : 0}
						chips={formChips}
						onclearfilters={() => (formFilter = "")}
						filters={forms.length > 1 ? formFilterField : undefined}
					>
						{#snippet end()}
							{#if !loading}<p class="meta">{visible.length} {visible.length === 1 ? "application" : "applications"}</p>{/if}
						{/snippet}
					</FilterBar>
				{/snippet}
			</PageHeader>
			{#if error}
				<EmptyState tone="error" title="Could not load applications" text={error} />
			{:else if loading}
				<Skeleton rows={6} lines={1} label="Loading applications…" />
			{:else if visible.length === 0}
				{#if rows.length === 0}
					<EmptyState icon="forms" title="No applications yet" text="When an artist applies to play on the website, it shows here." />
				{:else}
					<EmptyState icon="search" title="Nothing matches" text="Try another name or email, or clear the filters." />
				{/if}
			{:else}
				<div class="grid-host">
					{#if phone.matches}
						<FormsCards rows={visible} showForm={forms.length > 1} />
					{:else}
						<FormsGrid rows={visible} />
					{/if}
				</div>
			{/if}
		</div>
	{/if}
	<BusyOverlay active={loading && Boolean(openId)} label="Loading…" />
</div>

<style>
	.forms-root {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		background: var(--background);
	}

	.list {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		padding: var(--page-gutter);
	}

	.detail {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.split {
		display: flex;
		flex: 1;
		min-height: 0;
		padding: var(--space-4) var(--page-gutter);
	}

	.panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.panel-head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		column-gap: var(--space-3);
		row-gap: 0.2rem;
		flex-shrink: 0;
		padding: 0.55rem var(--card-pad-lg) 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.type-line {
		grid-column: 1;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		height: var(--control-h-sm);
		color: var(--primary);
	}

	.eyebrow {
		min-width: 0;
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.head-tools {
		grid-column: 2;
		grid-row: 1;
		display: flex;
		align-items: center;
		gap: var(--space-1);
		height: var(--control-h-sm);
	}

	.head-tools :global(.close-btn) {
		color: var(--muted-foreground);
	}

	.head-tools :global(.close-btn:hover:not(:disabled)) {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.title-name {
		grid-column: 1 / -1;
		grid-row: 2;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.name-line {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}

	.title {
		margin: 0;
		min-width: 0;
		font-family: var(--font-display);
		font-size: var(--text-2xl);
		font-weight: 600;
		letter-spacing: var(--tracking-2xl);
		line-height: 1.15;
		overflow-wrap: anywhere;
	}


	.sub {
		width: fit-content;
		margin: 0;
		color: var(--muted-foreground);
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.sub:hover {
		color: var(--foreground);
		text-decoration: underline;
	}

	.head-note {
		grid-column: 1 / -1;
		grid-row: 3;
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-3);
		margin: 0;
		padding-top: var(--space-2);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.4;
		color: var(--muted-foreground);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
		container-type: inline-size;
		container-name: play-detail;
	}

	.details-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5) var(--space-6);
		align-items: start;
	}

	.details-main,
	.details-side {
		display: grid;
		gap: var(--space-3);
		align-content: start;
		min-width: 0;
	}

	@container play-detail (min-width: 52rem) {
		.details-board {
			grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		}

		.details-side {
			position: sticky;
			top: 0;
		}
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: 1.3;
		color: var(--foreground);
	}

	.section-title::after {
		content: "";
		flex: 1 1 auto;
		height: 1px;
		min-width: 1.5rem;
		background: var(--border-strong);
	}

	.answers {
		display: grid;
		gap: var(--space-4);
		margin: 0;
	}

	.answer {
		display: grid;
		gap: var(--space-1);
	}

	dt {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	dd {
		margin: 0;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	dd a {
		color: var(--primary);
		text-underline-offset: 0.15em;
	}

	.card {
		display: grid;
		gap: var(--space-3);
		padding: var(--card-pad);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--background);
	}

	.artist-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.artist-actions p {
		margin: 0;
	}

	.card-title {
		margin: 0;
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.emails {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.emails li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-3);
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--destructive);
	}

	.dot.sent {
		background: var(--primary);
	}

	.email-copy {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
		font-size: var(--text-sm);
	}

	.email-label {
		font-weight: 500;
	}

	.sent-at {
		color: var(--muted-foreground);
	}

	.not-sent {
		color: var(--destructive);
	}

	.grid-host {
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.error {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	@media (max-width: 900px) {
		.split {
			padding: 0;
		}

		.panel {
			border-radius: 0;
			border-left: none;
			border-right: none;
		}

		.head-tools :global(.close-btn) {
			display: none;
		}

		.panel-head,
		.body {
			padding-left: max(var(--page-gutter), 1.125rem);
			padding-right: max(var(--page-gutter), 1.125rem);
		}
	}
</style>
