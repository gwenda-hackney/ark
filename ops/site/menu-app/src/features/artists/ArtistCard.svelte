<script lang="ts">
	import { onDestroy } from "svelte";
	import { Button, EditorBackBar, Field, Segmented, TextArea, TextField } from "../../ui";
	import {
		clearArtistImage,
		createArtist,
		deleteArtist,
		updateArtist,
		uploadArtistImage,
		type ArtistImage,
		type ArtistSlot,
		type WallArtist,
	} from "../../lib/api";
	import { leaveEditor, navigate } from "../../lib/nav";
	import { toast } from "../../lib/toast.svelte";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../../lib/unsaved.svelte";

	let {
		artist = null,
		onCreated,
	}: {
		artist?: WallArtist | null;
		onCreated?: (artist: WallArtist) => void;
	} = $props();

	const statusItems = [
		{ id: "current", label: "Current" },
		{ id: "next", label: "Next" },
		{ id: "previous", label: "Previous" },
	];

	let saving = $state(false);
	let removing = $state(false);
	let uploading = $state("");
	let error = $state("");
	let persisted = $state<WallArtist | null>(null);
	let name = $state("");
	let website = $state("");
	let profile = $state("");
	let bio = $state("");
	let slot = $state<ArtistSlot>("previous");
	let portrait = $state<ArtistImage | null>(null);
	let art = $state<ArtistImage[]>([]);
	let gwenda = $state<ArtistImage[]>([]);
	let seen = "";

	$effect.pre(() => {
		const id = artist?.id || "new";
		if (id === seen) return;
		seen = id;
		apply(artist ?? null);
	});

	let portraitInput = $state<HTMLInputElement | null>(null);
	let artInput = $state<HTMLInputElement | null>(null);
	let gwendaInput = $state<HTMLInputElement | null>(null);

	const dirty = $derived(
		name !== (persisted?.name || "") ||
			website !== (persisted?.website || "") ||
			profile !== (persisted?.profile || "") ||
			bio !== (persisted?.bio || "") ||
			slot !== (persisted?.slot || "previous"),
	);

	$effect(() => {
		setUnsavedGuard(dirty, () => {
			const next = takeBlockedNav();
			if (!next) return;
			if (!window.confirm("Leave without saving?")) return;
			beginLeave();
			navigate(next.path, { replace: next.replace, force: true });
		});
	});

	onDestroy(() => {
		clearUnsavedGuard();
	});

	function apply(row: WallArtist | null) {
		persisted = row;
		name = row?.name || "";
		website = row?.website || "";
		profile = row?.profile || "";
		bio = row?.bio || "";
		slot = row?.slot || "previous";
		portrait = row?.portrait || null;
		art = row?.art || [];
		gwenda = row?.gwenda || [];
	}

	function fail(err: unknown, fallback: string): string {
		const message = err instanceof Error ? err.message : fallback;
		if (message.startsWith("auth:")) {
			window.location.href = message.slice("auth:".length) || "/gate/";
			return "";
		}
		return message;
	}

	function hostLabel(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./i, "");
		} catch {
			return url;
		}
	}

	function close() {
		leaveEditor("/artists");
	}

	async function onSave(event: Event) {
		event.preventDefault();
		saving = true;
		error = "";
		const body = {
			name: name.trim(),
			website: website.trim(),
			profile: profile.trim(),
			bio: bio.trim(),
			slot,
		};
		try {
			if (persisted) {
				const data = await updateArtist(persisted.id, body);
				apply(data.artist);
				toast.ok("Artist saved.");
			} else {
				const data = await createArtist(body);
				apply(data.artist);
				toast.ok("Artist added.");
				beginLeave();
				onCreated?.(data.artist);
			}
		} catch (err) {
			const message = fail(err, "Could not save the artist.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			saving = false;
		}
	}

	async function onRemove() {
		if (!persisted) return;
		const label = persisted.name || "this artist";
		if (!window.confirm(`Remove ${label}?`)) return;
		removing = true;
		error = "";
		try {
			await deleteArtist(persisted.id);
			beginLeave();
			toast.ok("Artist removed.");
			navigate("/artists", { replace: true, force: true });
		} catch (err) {
			const message = fail(err, "Could not remove the artist.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			removing = false;
		}
	}

	async function onFiles(
		kind: "portrait" | "art" | "gwenda",
		input: HTMLInputElement | null,
	) {
		const files = [...(input?.files || [])];
		if (input) input.value = "";
		if (!files.length || !persisted) return;
		uploading = kind;
		error = "";
		try {
			for (const file of files) {
				const data = await uploadArtistImage(persisted.id, file, kind);
				apply(data.artist);
			}
			toast.ok(files.length === 1 ? "Photo added." : `${files.length} photos added.`);
		} catch (err) {
			const message = fail(err, "Could not add the photo.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			uploading = "";
		}
	}

	async function onClearImage(kind: "portrait" | "art" | "gwenda", imageName = "") {
		if (!persisted) return;
		uploading = kind;
		error = "";
		try {
			const data = await clearArtistImage(persisted.id, kind, imageName);
			apply(data.artist);
			toast.ok("Photo removed.");
		} catch (err) {
			const message = fail(err, "Could not remove the photo.");
			if (message) {
				error = message;
				toast.error(message);
			}
		} finally {
			uploading = "";
		}
	}
</script>

<EditorBackBar label="Artists" {dirty} onback={close} />

<div class="sheet scrollbar-fade">
	<form class="card-form" onsubmit={onSave}>
		<Field
			label="Place"
			tooltip="Current is on the wall. Next is lined up. Previous has already hung here. Only one current and one next: saving that badge moves the artist who had it to previous."
		>
			<Segmented bind:value={slot} items={statusItems} ariaLabel="Place on the wall" size="sm" />
		</Field>
		<Field label="Name" for="artist-name">
			<TextField id="artist-name" bind:value={name} placeholder="Their name" required />
		</Field>
		<Field label="Website" for="artist-website" tooltip="A link to their own site.">
			<TextField
				id="artist-website"
				bind:value={website}
				placeholder="https://"
				autocomplete="url"
			/>
		</Field>
		{#if persisted?.website}
			<p class="site">
				<a href={persisted.website} target="_blank" rel="noreferrer">
					{hostLabel(persisted.website)}
				</a>
			</p>
		{/if}
		<Field
			label="Profile"
			for="artist-profile"
			tooltip="A short introduction. This sits above the longer bio."
		>
			<TextArea
				id="artist-profile"
				rows={3}
				bind:value={profile}
				placeholder="Who they are, in a few lines."
			/>
		</Field>
		<Field label="Bio" for="artist-bio" tooltip="The longer note for their page.">
			<TextArea id="artist-bio" rows={6} bind:value={bio} placeholder="The fuller story." />
		</Field>
		<div class="actions">
			{#if persisted}
				<Button variant="ghost" type="button" disabled={removing || saving} onclick={onRemove}>
					Remove
				</Button>
			{/if}
			<Button type="submit" variant="primary" busy={saving} disabled={!dirty || saving}>
				Save
			</Button>
		</div>
	</form>

	<section class="media">
		<div class="block">
			<div class="block-head">
				<h3>Profile photo</h3>
				{#if persisted}
					<Button
						variant="outline"
						size="sm"
						type="button"
						busy={uploading === "portrait"}
						disabled={Boolean(uploading)}
						onclick={() => portraitInput?.click()}
					>
						{portrait ? "Replace" : "Add"}
					</Button>
				{/if}
			</div>
			<input
				bind:this={portraitInput}
				class="file"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				onchange={() => onFiles("portrait", portraitInput)}
			/>
			{#if portrait}
				<figure class="portrait">
					<img src={portrait.thumb || portrait.url} alt="{name || 'Artist'} profile" />
					<button
						type="button"
						aria-label="Remove profile photo"
						onclick={() => onClearImage("portrait", portrait?.name || "")}
					>
						Remove
					</button>
				</figure>
			{:else}
				<p class="muted">No profile photo yet.</p>
			{/if}
		</div>

		<div class="block">
			<div class="block-head">
				<h3>Art</h3>
				{#if persisted}
					<Button
						variant="outline"
						size="sm"
						type="button"
						busy={uploading === "art"}
						disabled={Boolean(uploading)}
						onclick={() => artInput?.click()}
					>
						Add
					</Button>
				{/if}
			</div>
			<input
				bind:this={artInput}
				class="file"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				multiple
				onchange={() => onFiles("art", artInput)}
			/>
			{#if art.length}
				<ul class="shots">
					{#each art as image (image.name)}
						<li>
							<img src={image.thumb || image.url} alt="{name || 'Artist'} artwork" />
							<button
								type="button"
								aria-label="Remove {image.label || 'artwork'}"
								onclick={() => onClearImage("art", image.name)}
							>
								Remove
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">No art yet.</p>
			{/if}
		</div>

		<div class="block">
			<div class="block-head">
				<h3>Photos from Gwenda</h3>
				{#if persisted}
					<Button
						variant="outline"
						size="sm"
						type="button"
						busy={uploading === "gwenda"}
						disabled={Boolean(uploading)}
						onclick={() => gwendaInput?.click()}
					>
						Add
					</Button>
				{/if}
			</div>
			<input
				bind:this={gwendaInput}
				class="file"
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				multiple
				onchange={() => onFiles("gwenda", gwendaInput)}
			/>
			{#if gwenda.length}
				<ul class="shots">
					{#each gwenda as image (image.name)}
						<li>
							<img
								src={image.thumb || image.url}
								alt="Photo of {name || 'the artist'} at Gwenda"
							/>
							<button
								type="button"
								aria-label="Remove {image.label || 'Gwenda photo'}"
								onclick={() => onClearImage("gwenda", image.name)}
							>
								Remove
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">No photos from Gwenda yet.</p>
			{/if}
		</div>

		{#if !persisted}
			<p class="muted">Save the name first, then add photos.</p>
		{/if}
		{#if error}
			<p class="error">{error}</p>
		{/if}
	</section>
</div>

<style>
	.sheet {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.card-form,
	.media,
	.block {
		display: grid;
		gap: var(--gap-md);
		max-width: 40rem;
	}

	.media {
		margin-top: var(--gap-lg);
	}

	.block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.block-head h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.site {
		margin: -0.35rem 0 0;
		font-size: var(--text-sm);
	}

	.site a {
		color: var(--primary);
		font-weight: 600;
		text-decoration: none;
	}

	.site a:hover {
		text-decoration: underline;
	}

	.muted,
	.error {
		margin: 0;
		font-size: var(--text-sm);
	}

	.muted {
		color: var(--muted-foreground);
	}

	.error {
		color: var(--destructive, #c97a7a);
	}

	.portrait,
	.shots {
		margin: 0;
		padding: 0;
	}

	.portrait,
	.shots li {
		display: grid;
		gap: 0.35rem;
		justify-items: start;
	}

	.portrait img,
	.shots img {
		display: block;
		width: 100%;
		height: 8.5rem;
		object-fit: cover;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: var(--background);
	}

	.portrait {
		max-width: 11rem;
	}

	.shots {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
		gap: 0.6rem;
	}

	.portrait button,
	.shots button {
		border: 0;
		padding: 0;
		background: none;
		color: var(--muted-foreground);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.portrait button:hover,
	.shots button:hover {
		color: var(--destructive, #c97a7a);
	}
</style>
