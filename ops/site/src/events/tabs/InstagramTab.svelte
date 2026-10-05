<script lang="ts">
	/**
	 * Post this series, night or special to Instagram now (#26): a 4:5 preview
	 * of the image, the caption to edit, Check and Post. The account a post
	 * goes to is always on the Post button and in the confirm.
	 */
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Icon } from "../../app/shell";
	import { Button, ConfirmDialog, DataGrid, EmptyState, FormSection, TextArea } from "../../ui";
	import { Confirm } from "../../ui/confirm.svelte";
	import type { InstagramPost } from "../../app/api";
	import {
		captionLength,
		checkBlocker,
		postBlocker,
		postedLabel,
		type EventInstagram,
	} from "../event-instagram.svelte";

	let {
		instagram,
		eventId,
		date = "",
	}: {
		instagram: EventInstagram;
		eventId: string;
		/** The night's date; "" for the series or a special. */
		date?: string;
	} = $props();

	const confirm = new Confirm();

	const draft = $derived(instagram.draft);
	const setup = $derived(instagram.setup);
	const username = $derived(instagram.status?.account?.username || "");
	const dryRun = $derived(setup?.mode === "dry-run");
	const postLabel = $derived(
		dryRun ? "Post (dry run)" : username ? `Post to @${username}` : "Post to Instagram",
	);
	const length = $derived(captionLength(instagram.caption));
	const limit = $derived(draft?.captionLimit || 2200);
	const over = $derived(length > limit);
	const blockers = $derived({ draft, setup, caption: instagram.caption, busy: instagram.busy });
	const postReason = $derived(postBlocker(blockers));
	const checkReason = $derived(checkBlocker(blockers));
	const what = $derived(draft?.kind === "night" ? "this night" : draft?.kind === "special" ? "this event" : "this series");

	async function onPost() {
		if (postReason || !draft) return;
		const last = draft.lastPosted;
		const where = username ? `@${username}` : "Instagram";
		const ok = await confirm.ask(
			last
				? {
						title: `Post ${what} to ${where} again?`,
						message: `It was already posted on ${postedLabel(last.sentAt)}. Posting again puts a second post on the feed.`,
						action: "Post again",
						tone: "primary",
					}
				: {
						title: dryRun ? "Try a dry run?" : `Post to ${where}?`,
						message: dryRun
							? "Nothing is sent to Instagram from here."
							: `It goes on ${where}'s feed straight away. You can delete it on Instagram, not here.`,
						action: dryRun ? "Try it" : "Post",
						tone: "primary",
					},
		);
		if (!ok) return;
		await instagram.post(eventId, Boolean(last));
	}

	const statusLabels: Record<InstagramPost["status"], string> = {
		sent: "Posted",
		failed: "Didn't post",
		publishing: "On its way",
	};

	function linkCell(params: ICellRendererParams<InstagramPost>) {
		const href = params.data?.permalink || "";
		if (!href) return "";
		const link = document.createElement("a");
		link.href = href;
		link.target = "_blank";
		link.rel = "noreferrer";
		link.textContent = "View on Instagram";
		return link;
	}

	const columnDefs: ColDef<InstagramPost>[] = [
		{
			headerName: "When",
			colId: "when",
			width: 130,
			flex: 0,
			valueGetter: (p) => postedLabel(p.data?.sentAt || p.data?.createdAt || ""),
		},
		{
			headerName: "Status",
			colId: "status",
			width: 120,
			flex: 0,
			valueGetter: (p) => (p.data ? statusLabels[p.data.status] || p.data.status : ""),
			tooltipValueGetter: (p) => p.data?.lastError || "",
		},
		{ headerName: "By", colId: "by", flex: 1, minWidth: 140, valueGetter: (p) => p.data?.postedBy || "" },
		{ headerName: "", colId: "link", width: 150, flex: 0, sortable: false, cellRenderer: linkCell },
	];
</script>

<div class="instagram">
	{#if instagram.error}
		<EmptyState tone="error" title="Couldn't load Instagram" text={instagram.error}>
			{#snippet action()}
				<Button variant="secondary" size="sm" onclick={() => void instagram.load(eventId, date, true)}>
					{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}
					Try again
				</Button>
			{/snippet}
		</EmptyState>
	{:else if setup && !setup.ready}
		<EmptyState icon="send" title={setup.message} text="Ask whoever looks after ops to connect the Instagram account here." />
		{#if setup.detail}<p class="detail">{setup.detail}</p>{/if}
	{:else if !draft}
		<p class="hint">Loading…</p>
	{:else}
		<FormSection title="Post now" help="Instagram">
			<div class="composer">
				<figure class="preview" aria-label="How the image looks on Instagram">
					{#if draft.imageUrl}
						<img src={draft.imageUrl} alt="What Instagram gets, cropped to 4:5" />
					{:else}
						<div class="no-image"><p>{draft.imageProblem}</p></div>
					{/if}
				</figure>
				<div class="words">
					<label class="label" for="instagram-caption">Caption</label>
					<TextArea
						id="instagram-caption"
						rows={12}
						bind:value={instagram.caption}
						disabled={instagram.busy}
						aria-describedby="instagram-caption-count"
					/>
					<div class="caption-foot">
						<span id="instagram-caption-count" class="count" class:over aria-live="polite">
							{length.toLocaleString("en-GB")} / {limit.toLocaleString("en-GB")}
						</span>
						<Button
							variant="ghost"
							size="xs"
							disabled={instagram.busy || instagram.caption === draft.caption}
							reason={instagram.caption === draft.caption ? "Already the suggested caption" : undefined}
							onclick={() => instagram.resetCaption()}>Use suggested caption</Button
						>
					</div>

					<div class="actions">
						<Button
							variant="secondary"
							busy={instagram.checking}
							disabled={Boolean(checkReason)}
							reason={checkReason || undefined}
							title="Instagram checks the image and caption. Nothing is posted."
							onclick={() => void instagram.check(eventId)}
						>
							{#snippet icon()}<Icon name="check" size={16} />{/snippet}
							Check
						</Button>
						<Button
							busy={instagram.posting}
							disabled={Boolean(postReason)}
							reason={postReason || undefined}
							onclick={() => void onPost()}
						>
							{#snippet icon()}<Icon name="send" size={16} />{/snippet}
							{postLabel}
						</Button>
					</div>

					{#if draft.posting}
						<p class="hint">
							A post is on its way to Instagram. If it isn't listed below in a minute, press Post again to finish it. It won't post twice.
						</p>
					{/if}
					{#if !draft.live}
						<p class="hint">Update website first: the post links to {what}'s page, which isn't on the website yet.</p>
					{/if}
					{#if setup?.mode === "fake"}
						<p class="hint">Posts from here go to the fake Instagram, not the real account.</p>
					{:else if dryRun}
						<p class="hint">Dry run: nothing is sent to Instagram from here.</p>
					{/if}
					{#if instagram.status?.accountError}
						<p class="error">{instagram.status.accountError}</p>
					{/if}
					{#if instagram.notice}
						<p class="notice {instagram.noticeTone}" role={instagram.noticeTone === "error" ? "alert" : "status"}>
							{instagram.notice}
						</p>
					{/if}
					{#if draft.lastPosted}
						<p class="posted">
							Posted on {postedLabel(draft.lastPosted.sentAt)}
							{#if draft.lastPosted.permalink}
								· <a href={draft.lastPosted.permalink} target="_blank" rel="noreferrer">View on Instagram</a>
							{/if}
						</p>
					{/if}
				</div>
			</div>
		</FormSection>

		<FormSection title="Posted" description={draft.posts.length ? "" : "Nothing posted yet."}>
			{#if draft.posts.length}
				<div class="grid">
					<DataGrid rowData={draft.posts} {columnDefs} getRowId={(row) => row.id} domLayout="autoHeight" />
				</div>
			{/if}
		</FormSection>
	{/if}
</div>

<ConfirmDialog {confirm} />

<style>
	.instagram {
		display: grid;
		gap: var(--space-4);
	}

	.composer {
		display: grid;
		grid-template-columns: minmax(12rem, 20rem) minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}

	@container event-detail (max-width: 40rem) {
		.composer {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.preview {
		margin: 0;
		aspect-ratio: 4 / 5;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: #0d0d0d;
	}

	.preview img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.no-image {
		display: grid;
		place-content: center;
		height: 100%;
		padding: var(--space-4);
		color: var(--muted-foreground);
		background: var(--sunken);
		text-align: center;
		font-size: var(--text-sm);
	}

	.words {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--foreground);
	}

	.caption-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.count {
		color: var(--muted-foreground);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.count.over {
		color: var(--destructive);
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: flex-end;
		margin-top: var(--space-2);
	}

	.hint,
	.detail,
	.posted,
	.notice,
	.error {
		margin: 0;
		font-size: var(--text-sm);
	}

	.hint,
	.detail {
		color: var(--muted-foreground);
	}

	.detail {
		text-align: center;
		font-size: var(--text-xs);
	}

	.error,
	.notice.error {
		color: var(--destructive);
	}

	.notice.ok {
		color: var(--success, var(--foreground));
	}

	.posted a {
		color: inherit;
		font-weight: 600;
	}

	.grid {
		min-width: 0;
	}
</style>
