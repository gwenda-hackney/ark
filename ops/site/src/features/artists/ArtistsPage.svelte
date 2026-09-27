<script lang="ts">
	import { onDestroy } from "svelte";
	import { BusyOverlay, Button, PageHeader } from "../../ui";
	import ArtistCard from "./ArtistCard.svelte";
	import { getArtist, getArtists, type ArtistSlot, type WallArtist } from "../../lib/api";
	import { setCrumbLeaf } from "../../lib/crumbs.svelte";
	import { navigate, parseShellPath } from "../../lib/nav";

	let { path = "/artists" }: { path?: string } = $props();

	const route = $derived(parseShellPath(path));
	const editing = $derived(
		route.page === "artists" && Boolean(route.isNew || route.slug),
	);

	const badgeLabel: Record<ArtistSlot, string> = {
		current: "Current",
		next: "Next",
		previous: "Previous",
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
				if (message.startsWith("auth:")) {
					window.location.href = message.slice("auth:".length) || "/gate/";
					return;
				}
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
			if (message.startsWith("auth:")) {
				window.location.href = message.slice("auth:".length) || "/gate/";
				return;
			}
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
				title="Artist"
				subtitle="Who is on the wall, who is next, and who has been here before."
			>
				{#snippet actions()}
					<Button variant="primary" type="button" onclick={() => navigate("/artists/new")}>
						Add artist
					</Button>
				{/snippet}
			</PageHeader>

			{#if error}
				<p class="error">{error}</p>
			{:else if !listLoading && artists.length === 0}
				<p class="muted">No artists yet.</p>
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
									<span class="badge {artist.slot}">{badgeLabel[artist.slot]}</span>
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
		<BusyOverlay active={listLoading} label="Loading…" />
	{/if}
</div>

<style>
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

	.grid {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
		gap: 0.9rem;
		margin: 0;
		padding: 0;
	}

	.tile {
		display: grid;
		gap: 0.4rem;
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
		border-radius: 0.45rem;
		background: var(--background);
	}

	.frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.mark {
		font-size: 1.6rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.badge {
		position: absolute;
		top: 0.45rem;
		left: 0.45rem;
		padding: 0.12rem 0.45rem;
		border-radius: 999px;
		background: color-mix(in srgb, var(--background) 88%, transparent);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.badge.current {
		color: var(--primary);
	}

	.badge.next {
		color: var(--foreground);
	}

	.badge.previous {
		color: var(--muted-foreground);
	}

	.name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.meta,
	.muted,
	.error {
		font-size: var(--text-sm);
	}

	.meta,
	.muted {
		color: var(--muted-foreground);
	}

	.error {
		margin: 0;
		color: var(--destructive, #c97a7a);
	}

	.muted {
		margin: 0;
	}
</style>
