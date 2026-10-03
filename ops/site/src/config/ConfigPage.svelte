<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { BusyOverlay, Button, Card, Field, NativeSelect, PageHeader, TextField } from "../ui";
	import PourTargetsForm from "./PourTargetsForm.svelte";
	import { pourSettings } from "./settings.svelte";
	import { getMe, getOpsConfig, getOpsUsers, saveEventTaskSettings, type AuthMe } from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import type { OpsUser } from "../users/types";

	const waited = !pourSettings.loaded;
	let connection = $state<AuthMe | null>(null);
	let users = $state<OpsUser[]>([]);
	let socialEmail = $state("");
	let clickupListId = $state("");
	let savingTasks = $state(false);
	/** As last loaded or saved, so Save only lights up for a real change. */
	let savedTasks = $state({ socialEmail: "", clickupListId: "" });
	const tasksDirty = $derived(
		socialEmail !== savedTasks.socialEmail || clickupListId.trim() !== savedTasks.clickupListId,
	);

	onMount(() => {
		void getMe()
			.then((row) => {
				connection = row;
			})
			.catch(() => {
				connection = null;
			});
		void getOpsUsers()
			.then((data) => {
				users = (data.users || []).filter((user) => user.active !== false);
			})
			.catch(() => {
				users = [];
			});
		void getOpsConfig()
			.then((data) => {
				socialEmail = data.settings?.taskRoleSocial || "";
				clickupListId = data.settings?.clickupEventsListId || "";
				savedTasks = { socialEmail, clickupListId };
			})
			.catch(() => {});
	});

	const socialOptions = $derived.by(() => {
		const options = [
			{ value: "", label: "Unassigned" },
			...users
				.filter((user) => user.email)
				.map((user) => ({
					value: user.email || "",
					label: user.name ? `${user.name} (${user.email})` : user.email || "",
				})),
		];
		if (socialEmail && !options.some((option) => option.value === socialEmail)) {
			options.push({ value: socialEmail, label: socialEmail });
		}
		return options;
	});

	async function saveTasks(event: Event) {
		event.preventDefault();
		if (!tasksDirty || savingTasks) return;
		savingTasks = true;
		try {
			const data = await saveEventTaskSettings({
				socialEmail,
				clickupListId: clickupListId.trim(),
			});
			socialEmail = data.settings?.taskRoleSocial || "";
			clickupListId = data.settings?.clickupEventsListId || "";
			savedTasks = { socialEmail, clickupListId };
			toast.ok("Task roles saved.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not save task roles.");
		} finally {
			savingTasks = false;
		}
	}

	const baserowHref = $derived(
		connection?.databaseId
			? `https://baserow.io/database/${connection.databaseId}/`
			: "",
	);
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Configuration"
		subtitle="House targets used by recipe analysis and the dashboard."
	/>

	{#if pourSettings.loaded}
		<div
			class="stack"
			in:fly={{ y: waited ? 10 : 0, duration: waited ? flyMs : 0, easing: easeOut }}
		>
			{#if connection}
				<Card
					title="Environment"
					subtitle="Which Baserow database this ops session writes to."
				>
					<dl class="env-grid">
						<div>
							<dt>Site</dt>
							<dd>{connection.envLabel}</dd>
						</div>
						<div>
							<dt>Database</dt>
							<dd>
								{#if baserowHref}
									<a href={baserowHref} target="_blank" rel="noreferrer">
										{connection.databaseLabel}
										<span class="mono">({connection.databaseId})</span>
									</a>
								{:else}
									{connection.databaseLabel}
								{/if}
							</dd>
						</div>
						{#if connection.risk}
							<div class="span warn">
								<dt>Warning</dt>
								<dd>
									This is a local copy working on live data. Changes affect the
									real website.
								</dd>
							</div>
						{/if}
					</dl>
				</Card>
			{/if}

			<Card
				title="Pour cost"
				subtitle="Ingredient cost as a share of selling price, by drink type."
			>
				<PourTargetsForm idPrefix="config-pour" />
			</Card>

			<Card
				title="Event tasks"
				subtitle="Who gets the social post, and which ClickUp list it lands in."
			>
				<form class="tasks" novalidate onsubmit={saveTasks}>
					<Field label="Social" for="task-social" width="lg" optional hint="Gets the social post task for each event.">
						<NativeSelect id="task-social" bind:value={socialEmail} options={socialOptions} />
					</Field>
					<Field
						label="ClickUp list id"
						for="task-list"
						width="md"
						optional
						hint="The Gwenda list that receives event tasks."
					>
						<TextField id="task-list" bind:value={clickupListId} mono inputmode="numeric" spellcheck="false" />
					</Field>
					<div class="task-actions">
						{#if tasksDirty}<span class="unsaved">Unsaved changes</span>{/if}
						<Button type="submit" busy={savingTasks} disabled={savingTasks || !tasksDirty}>
							Save task roles
						</Button>
					</div>
				</form>
			</Card>
		</div>
	{/if}
	<BusyOverlay active={!pourSettings.loaded} label="Loading…" />
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--space-6);
		max-width: 36rem;
		align-content: start;
	}

	.tasks {
		display: grid;
		gap: var(--space-4);
	}

	.task-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-3);
	}

	.unsaved {
		font-size: var(--text-sm);
		color: var(--warning);
	}

	.env-grid {
		display: grid;
		gap: var(--space-3);
		margin: 0;
	}

	.env-grid > div {
		display: grid;
		gap: 0.2rem;
	}

	.env-grid .span {
		padding-top: var(--space-1);
		border-top: 1px solid var(--border);
	}

	.env-grid .warn dd {
		color: var(--warning);
	}

	.env-grid dt {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.env-grid dd {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 500;
		color: var(--foreground);
	}

	.env-grid a {
		color: var(--primary);
		text-decoration: none;
	}

	.env-grid a:hover {
		text-decoration: underline;
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 0.9em;
		font-weight: 500;
		color: var(--muted-foreground);
	}
</style>
