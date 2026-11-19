<script lang="ts">
	/**
	 * Email → Write → Promote (#348): pick what to promote (a pop-up kitchen
	 * for now) and which one; its template makes the draft, which opens in
	 * the editor to change, test and send like any other.
	 */
	import { Button, Dialog, EmptyState, Field, NativeSelect, Skeleton } from "../ui";
	import { Icon } from "../app/shell";
	import { navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import { getPromoteChoices, promoteInEmail, type PromoteTemplate } from "./email-api";
	import { writePath } from "./one-off-view";

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	let templates = $state<PromoteTemplate[]>([]);
	let loading = $state(false);
	let error = $state("");
	let templateId = $state("");
	let choiceId = $state("");
	let making = $state(false);

	const template = $derived(templates.find((row) => row.id === templateId) || null);
	const choice = $derived(template?.choices.find((row) => row.id === choiceId) || null);

	$effect(() => {
		if (!open) return;
		loading = true;
		error = "";
		void getPromoteChoices()
			.then((data) => {
				templates = data.templates;
				templateId = data.templates[0]?.id || "";
				choiceId = data.templates[0]?.choices[0]?.id || "";
			})
			.catch((err) => (error = err instanceof Error ? err.message : "Couldn't load what can be promoted."))
			.finally(() => (loading = false));
	});

	function pickTemplate(id: string) {
		templateId = id;
		choiceId = templates.find((row) => row.id === id)?.choices[0]?.id || "";
	}

	async function make() {
		if (!template || !choice) return;
		making = true;
		try {
			const { email } = await promoteInEmail(template.id, choice.id);
			toast.ok(`Drafted from the ${template.label.toLowerCase()} template. Change anything, then send yourself a test.`);
			onclose();
			navigate(writePath(email.id));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't make the email.");
		} finally {
			making = false;
		}
	}
</script>

<Dialog {open} title="Promote in an email" {onclose}>
	{#if error}
		<EmptyState tone="error" title="Couldn't load what can be promoted" text={error} />
	{:else if loading}
		<Skeleton rows={2} lines={1} label="Loading…" />
	{:else}
		<div class="fields">
			<Field label="What" for="promote-template">
				<NativeSelect
					id="promote-template"
					value={templateId}
					options={templates.map((row) => ({ value: row.id, label: row.label }))}
					onchange={(e) => pickTemplate(e.currentTarget.value)}
				/>
			</Field>
			{#if template && !template.choices.length}
				<p class="none">Nothing to promote: no {template.label.toLowerCase().replace(/^an? /, "")} has nights to come.</p>
			{:else if template}
				<Field label="Which" for="promote-choice" hint={choice?.when}>
					<NativeSelect
						id="promote-choice"
						bind:value={choiceId}
						options={template.choices.map((row) => ({ value: row.id, label: row.name }))}
					/>
				</Field>
			{/if}
			<p class="note">It makes a draft from what ops knows (its picture, when, a few dishes and the links), for you to change before it goes.</p>
		</div>
	{/if}
	{#snippet footer()}
		<Button variant="outline" size="sm" type="button" disabled={making} onclick={onclose}>Cancel</Button>
		<Button size="sm" type="button" busy={making} disabled={!choice || making} onclick={() => void make()}>
			{#snippet icon()}<Icon name="send" size={14} />{/snippet}
			Make the email
		</Button>
	{/snippet}
</Dialog>

<style>
	.fields {
		display: grid;
		gap: var(--space-4);
	}
	.none,
	.note {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
</style>
