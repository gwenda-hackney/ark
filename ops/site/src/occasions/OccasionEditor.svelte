<script lang="ts">
	/**
	 * An occasion's page (#353): its name and words, the days home shows it,
	 * what's included, and its picture. Save occasion puts every occasion on the
	 * website. The picture saves as soon as it's added, once the occasion is
	 * saved. It sits in the same card as every ops editor (EditorShell).
	 */
	import { onDestroy } from "svelte";
	import {
		Badge,
		ConfirmDialog,
		DateField,
		EditorShell,
		EmptyState,
		Field,
		FormSection,
		HelpDrawer,
		PhotoActions,
		TextArea,
		TextField,
	} from "../ui";
	import { leaveEditor, navigate, parseShellPath } from "../app/nav";
	import { setCrumbLeaf } from "../ui/crumbs.svelte";
	import { provideHelp } from "../ui/help.svelte";
	import { toast } from "../ui/toast.svelte";
	import { beginLeave, clearUnsavedGuard, setUnsavedGuard, takeBlockedNav } from "../ui/unsaved.svelte";
	import { occasionProblems } from "./occasion-model.js";
	import { OCCASION_HELP } from "./occasion-help";
	import { STATE_LABELS, STATE_TONES, blankOccasion, showDays } from "./occasion-view";
	import {
		clearOccasionImage,
		createOccasion,
		deleteOccasion,
		getOccasion,
		updateOccasion,
		uploadOccasionImage,
		type Occasion,
		type OccasionFields,
	} from "./occasions-api";

	let {
		path,
		open = true,
		onchanged,
	}: { path: string; open?: boolean; /** After a save or delete, for the list to load again. */ onchanged?: () => void } =
		$props();

	const route = $derived(parseShellPath(path));
	const isNew = $derived(Boolean(route.isNew));
	const occasionId = $derived(route.isNew ? "" : String(route.slug || ""));

	const help = provideHelp("Occasion", OCCASION_HELP);

	let occasion = $state<Occasion | null>(null);
	let fields = $state<OccasionFields>(blankOccasion());
	let saved = $state(JSON.stringify(blankOccasion()));
	let alt = $state("");
	let loading = $state(false);
	let error = $state("");
	let saving = $state(false);
	let picturing = $state(false);
	let deleting = $state(false);
	let deleteOpen = $state(false);
	let discardOpen = $state(false);
	let tried = $state(false);

	const dirty = $derived(JSON.stringify(fields) !== saved);
	const problems = $derived(occasionProblems(fields) as Record<string, string>);
	const shown = (field: string) => (tried ? problems[field] : undefined);
	const canSave = $derived(!saving && (isNew || dirty));

	function take(value: Occasion | null) {
		occasion = value;
		const next: OccasionFields = value
			? {
					name: value.name,
					line: value.line,
					included: value.included,
					covers: value.covers,
					showFrom: value.showFrom,
					showUntil: value.showUntil,
				}
			: blankOccasion();
		fields = next;
		saved = JSON.stringify(next);
		alt = value?.image?.alt || "";
		tried = false;
	}

	$effect(() => {
		if (!open) return;
		const id = occasionId;
		if (isNew) {
			take(null);
			error = "";
			setCrumbLeaf("");
			return;
		}
		if (!id) return;
		let cancelled = false;
		loading = true;
		error = "";
		void getOccasion(id)
			.then((data) => {
				if (cancelled) return;
				take(data.occasion);
				setCrumbLeaf(data.occasion.name);
			})
			.catch((err) => {
				if (!cancelled) error = err instanceof Error ? err.message : "Couldn't load this occasion.";
			})
			.finally(() => {
				if (!cancelled) loading = false;
			});
		return () => {
			cancelled = true;
		};
	});

	function report(result: { warnings?: string[]; published?: boolean }, done: string) {
		for (const warning of result.warnings || []) toast.error(warning);
		if (!result.warnings?.length) toast.ok(result.published ? `${done} On the website.` : `${done} On the preview.`);
	}

	async function save() {
		tried = true;
		if (Object.keys(problems).length) return;
		saving = true;
		try {
			const result = isNew ? await createOccasion(fields) : await updateOccasion(Number(occasionId), fields);
			take(result.occasion);
			report(result, "Saved.");
			onchanged?.();
			if (isNew) navigate(`/occasions/${result.occasion.id}`, { replace: true, force: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the occasion.");
		} finally {
			saving = false;
		}
	}

	async function onPicture(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file || !occasion) return;
		picturing = true;
		try {
			const result = await uploadOccasionImage(occasion.id, file, alt.trim());
			occasion = result.occasion;
			report(result, "Picture added.");
			onchanged?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't add the picture.");
		} finally {
			picturing = false;
		}
	}

	async function removePicture() {
		if (!occasion) return;
		picturing = true;
		try {
			const result = await clearOccasionImage(occasion.id);
			occasion = result.occasion;
			report(result, "Picture taken off.");
			onchanged?.();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't take the picture off.");
		} finally {
			picturing = false;
		}
	}

	async function remove() {
		if (!occasion) return;
		deleting = true;
		try {
			await deleteOccasion(occasion.id);
			deleteOpen = false;
			toast.ok(`Deleted ${occasion.name}.`);
			onchanged?.();
			beginLeave();
			navigate("/occasions", { replace: true, force: true });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete the occasion.");
		} finally {
			deleting = false;
		}
	}

	function back() {
		leaveEditor("/occasions");
	}

	$effect(() => {
		setUnsavedGuard(open && dirty && !saving, () => (discardOpen = true));
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
		navigate(pending?.path || "/occasions", { force: true, replace: pending?.replace ?? true });
	}

	const heading = $derived(isNew ? fields.name.trim() || "New occasion" : occasion?.name || "Occasion");
	const subtitle = $derived(
		isNew
			? "Name it and say when home shows it, then save it and add its picture."
			: occasion
				? `On home ${showDays(occasion)}`
				: "",
	);
	const pictureReason = $derived(isNew ? "Save it first" : undefined);
</script>

{#snippet kicker()}
	<p class="eyebrow">Occasion</p>
	{#if occasion}<Badge tone={STATE_TONES[occasion.state]} label={STATE_LABELS[occasion.state]} />{/if}
{/snippet}

<EditorShell
	{open}
	backLabel="Occasions"
	onclose={back}
	{dirty}
	busy={saving}
	{kicker}
	{heading}
	placeholder={isNew && !fields.name.trim()}
	{subtitle}
	actions={{
		saveLabel: isNew ? "Add occasion" : "Save occasion",
		savingLabel: isNew ? "Adding…" : "Saving…",
		saving,
		disabled: !canSave || deleting || Boolean(error) || loading,
		dirty,
		errorCount: tried ? Object.keys(problems).length : 0,
		onsave: () => void save(),
		overflow: [
			{
				label: "Delete occasion",
				tone: "destructive",
				disabled: isNew || deleting,
				reason: isNew ? "Save it first" : undefined,
				onselect: () => (deleteOpen = true),
			},
		],
	}}
>
	{#if error}
		<div class="tab-body">
			<EmptyState tone="error" title="Couldn't load this occasion" text={error} />
		</div>
	{:else}
		<div class="tab-body">
			<FormSection title="The occasion" description="What home says about it.">
				<Field class="span-6" label="Name" for="occasion-name" required error={shown("name")} hint="The card's heading, and how the enquiry is marked.">
					<TextField id="occasion-name" size="sm" bind:value={fields.name} placeholder="Christmas parties" autocomplete="off" />
				</Field>
				<Field class="span-6" label="When it's for" for="occasion-covers" optional error={shown("covers")} hint="In words, e.g. Throughout December.">
					<TextField id="occasion-covers" size="sm" bind:value={fields.covers} placeholder="Throughout December" autocomplete="off" />
				</Field>
				<Field class="span-12" label="Line" for="occasion-line" optional error={shown("line")} hint="A sentence or two under the name.">
					<TextArea id="occasion-line" rows={2} bind:value={fields.line} placeholder="Book the back room for your work do: drinks, food and your own playlist." />
				</Field>
				<Field class="span-12" label="What's included" for="occasion-included" optional error={shown("included")} hint="One thing a line.">
					<TextArea id="occasion-included" rows={4} bind:value={fields.included} placeholder={"Welcome drink\nCanapés\nYour own playlist"} />
				</Field>
			</FormSection>

			<FormSection title="On home" description="Home shows it from the first day to the last, both included, by itself.">
				<Field class="span-3" label="From" for="occasion-from" required error={shown("showFrom")}>
					<DateField id="occasion-from" size="sm" bind:value={fields.showFrom} />
				</Field>
				<Field class="span-3" label="Until" for="occasion-until" required error={shown("showUntil")}>
					<DateField id="occasion-until" size="sm" bind:value={fields.showUntil} min={fields.showFrom || undefined} />
				</Field>
			</FormSection>

			<FormSection title="Picture" description="The card's photo. It saves as soon as you add it.">
				<div class="span-12 picture">
					{#if occasion?.imageUrl}
						<img src={occasion.imageUrl} alt={occasion.image?.alt || ""} class="preview" />
					{:else}
						<div class="preview empty">No picture yet</div>
					{/if}
					<div class="picture-side">
						<Field label="Description" for="occasion-alt" optional hint="What it shows, for screen readers. Saved with the picture.">
							<TextField id="occasion-alt" size="sm" bind:value={alt} placeholder="The back room set for a party" autocomplete="off" />
						</Field>
						<PhotoActions
							replace={{ disabled: Boolean(pictureReason) || picturing, reason: pictureReason }}
							remove={occasion?.image ? { disabled: picturing } : undefined}
							onfile={onPicture}
							onremove={() => void removePicture()}
						/>
					</div>
				</div>
			</FormSection>
		</div>
	{/if}
</EditorShell>

<ConfirmDialog
	open={discardOpen}
	title="Discard unsaved changes?"
	message="You've changed this occasion and haven't saved it. The changes will be lost."
	action="Discard"
	cancelLabel="Keep editing"
	oncancel={keepEditing}
	onconfirm={discardAndLeave}
/>
<ConfirmDialog
	open={deleteOpen}
	title={`Delete ${occasion?.name || "this occasion"}?`}
	message="It comes off home. This can't be undone."
	action="Delete"
	busy={deleting}
	oncancel={() => (deleteOpen = false)}
	onconfirm={() => void remove()}
/>

<HelpDrawer {help} />

<style>
	.tab-body {
		position: relative;
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
	}

	.tab-body > :global(*) {
		max-width: 64rem;
	}

	.tab-body > :global(.form-section:first-child) {
		padding-top: 0;
		border-top: 0;
	}

	.picture {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		align-items: flex-start;
	}

	.preview {
		width: 14rem;
		aspect-ratio: 4 / 5;
		object-fit: cover;
		border-radius: var(--radius-md);
		background: var(--muted);
	}

	.preview.empty {
		display: grid;
		place-items: center;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.picture-side {
		display: grid;
		gap: var(--space-3);
		flex: 1;
		min-width: 14rem;
	}

	@media (max-width: 900px) {
		.tab-body {
			padding: var(--space-4) max(var(--page-gutter), 1.125rem) max(var(--page-gutter), 1.125rem);
		}
	}
</style>
