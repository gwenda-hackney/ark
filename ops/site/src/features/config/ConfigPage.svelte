<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { BusyOverlay, Button, Card, Field, NativeSelect, PageHeader, TextField } from "../../ui";
	import PourTargetsForm from "./PourTargetsForm.svelte";
	import { pourSettings } from "../../lib/settings.svelte";
	import { getMe, getOpsConfig, getOpsUsers, saveEventTaskSettings, type AuthMe } from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import { easeOut, flyMs } from "../../lib/motion";
	import type { OpsUser } from "../../lib/types";

	const waited = !pourSettings.loaded;
	let connection = $state<AuthMe | null>(null);
	let users = $state<OpsUser[]>([]);
	let socialEmail = $state("");
	let clickupListId = $state("");
	let savingTasks = $state(false);

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
		savingTasks = true;
		try {
			const data = await saveEventTaskSettings({
				socialEmail,
				clickupListId: clickupListId.trim(),
			});
			socialEmail = data.settings?.taskRoleSocial || "";
			clickupListId = data.settings?.clickupEventsListId || "";
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
				<form class="tasks" onsubmit={saveTasks}>
					<Field label="Social" for="task-social">
						<NativeSelect id="task-social" bind:value={socialEmail} options={socialOptions} />
					</Field>
					<Field
						label="ClickUp list id"
						for="task-list"
						hint="The Gwenda list that receives event tasks."
					>
						<TextField id="task-list" bind:value={clickupListId} mono />
					</Field>
					<Button type="submit" busy={savingTasks} disabled={savingTasks}>Save</Button>
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
		gap: var(--gap-lg);
		max-width: 36rem;
		align-content: start;
	}

	.tasks {
		display: grid;
		gap: var(--gap);
		justify-items: start;
	}

	.env-grid {
		display: grid;
		gap: 0.85rem;
		margin: 0;
	}

	.env-grid > div {
		display: grid;
		gap: 0.2rem;
	}

	.env-grid .span {
		padding-top: 0.35rem;
		border-top: 1px solid var(--border);
	}

	.env-grid .warn dd {
		color: var(--warning);
	}

	.env-grid dt {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.env-grid dd {
		margin: 0;
		font-size: var(--text);
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
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.9em;
		font-weight: 500;
		color: var(--muted-foreground);
	}
</style>
