<script lang="ts">
	import { Icon } from "../app/shell";
	import { onDestroy } from "svelte";
	import { Badge, BusyOverlay, Button, EmptyState, Notice, PageHeader } from "../ui";
	import ArtistCard from "./ArtistCard.svelte";
	import { getArtist, getArtists, type ArtistSlot, type WallArtist } from "../app/api";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { navigate, parseShellPath } from "../app/nav";
	import { navTabs } from "../app/nav-routes";
	import { addArtistAction } from "./featured-artist.js";

	let { path = "/artists" }: { path?: string } = $props();

	/** No new featured artists while the website shows none (#313); past ones stay. */
	const addArtist = addArtistAction();
	const subtitle = addArtist.disabled
		? "Artists whose work has been on the wall at Gwenda."
		: "Who is on the wall, who is next, and who has been here before.";

	const route = $derived(parseShellPath(path));
	const editing = $derived(
		route.page === "artists" && Boolean(route.isNew || route.slug),
	);

	const badgeLabel: Record<ArtistSlot, string> = {
		current: "Current",
		next: "Next",
		previous: "Previous",
	};
	const badgeTone: Record<ArtistSlot, "success" | "info" | "neutral"> = {
		current: "success",
		next: "info",
		previous: "neutral",
	};

	let artists = $state<WallArtist[]>([]);
	let listLoading = $state(true);
	let editorArtist = $state<WallArtist | null>(null);
	let editorLoading = $state(false);
	let error = $state("");

	$effect(() => {
		if (editing) return;
		void reloadList();
	});

	$effect(() => {
		const slug = route.page === "artists" ? route.slug : null;
		const isNew = route.page === "artists" && route.isNew;
		if (!isNew && !slug) {
			setCrumbLeaf("");
			return;
		}
		if (isNew) {
			editorArtist = null;
			editorLoading = false;
			error = "";
			setCrumbLeaf("");
			return;
		}
		const id = slug || "";
		let cancelled = false;
		editorLoading = true;
		error = "";
		void getArtist(id)
			.then((data) => {
				if (cancelled) return;
				editorArtist = data.artist;
				setCrumbLeaf(data.artist.name || "");
			})
			.catch((err) => {
				if (cancelled) return;
				const message = err instanceof Error ? err.message : "Could not load the artist.";
				error = message;
				editorArtist = null;
			})
			.finally(() => {
				if (!cancelled) editorLoading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		setCrumbLeaf("");
	});

	async function reloadList() {
		listLoading = true;
		error = "";
		try {
			const data = await getArtists();
			artists = data.artists || [];
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not load artists.";
			error = message;
		} finally {
			listLoading = false;
		}
	}

	function cover(artist: WallArtist): string {
		return (
			artist.portrait?.thumb ||
			artist.portrait?.url ||
			artist.art[0]?.thumb ||
			artist.art[0]?.url ||
			artist.gwenda[0]?.thumb ||
			artist.gwenda[0]?.url ||
			""
		);
	}

	function hostLabel(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return url;
		}
	}

	function mark(name: string): string {
		const letter = name.trim().charAt(0);
		return letter ? letter.toUpperCase() : "?";
	}
</script>

<!-- Add artist: while closed it stays in place, locked, with its reason beside it (#313). -->
{#snippet addButton(size: "md" | "sm")}
	<span class="add">
		<Button
			variant="primary"
			{size}
			type="button"
			disabled={addArtist.disabled}
			reason={addArtist.reason}
			onclick={() => navigate("/artists/new")}
		>
			{#snippet icon()}<Icon name={addArtist.disabled ? "lock" : "plus"} size={size === "sm" ? 14 : 16} />{/snippet}
			Add artist
		</Button>
		{#if addArtist.reason}<span class="why">{addArtist.reason}</span>{/if}
	</span>
{/snippet}

<div class="page">
	{#if editing}
		{#if editorLoading}
			<BusyOverlay active={true} label="Loading…" />
		{:else if error}
			<div class="sheet">
				<p class="error">{error}</p>
			</div>
		{:else}
			{#key route.isNew ? "new" : route.slug}
				<ArtistCard
					artist={editorArtist}
					onCreated={(artist) => navigate(`/artists/${artist.id}`, { replace: true })}
				/>
			{/key}
		{/if}
	{:else}
		<div class="sheet scrollbar-fade">
			<PageHeader
				title="Artists"
				tabs={{ items: navTabs("artists"), value: "featured" }}
				{subtitle}
			>
				{#snippet actions()}
					{@render addButton("md")}
				{/snippet}
			</PageHeader>

			{#if addArtist.disabled}
				<div class="off">
					<Notice tone="warning" title="Featured artist is off.">
						The website doesn't show one any more. You can look up past artists here, but you can't add new ones.
					</Notice>
				</div>
			{/if}

			{#if error}
				<EmptyState tone="error" title="Could not load artists" text={error} />
			{:else if listLoading && artists.length === 0}
				<ul class="grid" aria-hidden="true">
					{#each Array.from({ length: 6 }) as _, index (index)}
						<li class="tile-skel">
							<span class="skel frame-skel"></span>
							<span class="skel line-skel"></span>
						</li>
					{/each}
				</ul>
				<span class="sr-only" role="status">Loading artists…</span>
			{:else if artists.length === 0}
				<EmptyState
					icon="artist"
					title={addArtist.disabled ? "No past artists" : "No artists yet"}
					text={addArtist.disabled ? undefined : "Add the artist whose work is on the wall, and who is next."}
				>
					{#snippet action()}
						{@render addButton("sm")}
					{/snippet}
				</EmptyState>
			{:else}
				<ul class="grid">
					{#each artists as artist (artist.id)}
						<li>
							<a class="tile" href="/artists/{artist.id}">
								<span class="frame">
									{#if cover(artist)}
										<img src={cover(artist)} alt="" />
									{:else}
										<span class="mark">{mark(artist.name)}</span>
									{/if}
									<span class="slot"><Badge tone={badgeTone[artist.slot]} label={badgeLabel[artist.slot]} /></span>
								</span>
								<span class="name">{artist.name}</span>
								{#if artist.website}
									<span class="meta">{hostLabel(artist.website)}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<BusyOverlay active={listLoading && artists.length > 0} label="Loading…" />
	{/if}
</div>

<style>
	.tile-skel {
		display: grid;
		gap: var(--space-2);
	}

	.frame-skel {
		aspect-ratio: 1;
		border-radius: var(--radius-lg);
	}

	.line-skel {
		width: 60%;
		height: 0.875rem;
	}

	.page {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.sheet {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.off {
		margin-bottom: var(--space-6);
	}

	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.why {
		color: var(--fg-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.grid {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
		gap: var(--space-4);
		margin: 0;
		padding: 0;
	}

	.tile {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		color: inherit;
		text-decoration: none;
	}

	.frame {
		position: relative;
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--background);
	}

	.frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.mark {
		font-size: var(--text-xl);
		letter-spacing: var(--tracking-xl);
		font-weight: 600;
		color: var(--muted-foreground);
	}

	/* The shared Badge, on a solid backing so its wash reads over the photo. */
	.slot {
		position: absolute;
		top: 0.45rem;
		left: 0.45rem;
		display: inline-flex;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta,
	.error {
		font-size: var(--text-sm);
	}

	.meta {
		color: var(--muted-foreground);
	}

	.error {
		margin: 0;
		color: var(--danger);
	}
</style>
