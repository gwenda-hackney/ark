<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { fly } from "svelte/transition";
	import {
		BusyOverlay,
		Button,
		Card,
		ConfirmDialog,
		Field,
		NativeSelect,
		PageHeader,
		Segmented,
		TextField,
	} from "../ui";
	import SectionsTab from "../menu/SectionsTab.svelte";
	import { Icon } from "../app/shell";
	import { CONFIG_TABS, configTab, configTabPath } from "./config-tabs";
	import { parseShellPath } from "../app/nav";
	import PourTargetsForm from "./PourTargetsForm.svelte";
	import { pourSettings } from "./settings.svelte";
	import { getMe, getOpsConfig, getOpsUsers, saveEventTaskSettings, type AuthMe } from "../app/api";
	import { navigate } from "../app/nav";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import {
		beginLeave,
		clearUnsavedGuard,
		setUnsavedGuard,
		takeBlockedNav,
	} from "../ui/unsaved.svelte";
	import type { OpsUser } from "../users/types";

	let { path }: { path: string } = $props();

	const tab = $derived(configTab(parseShellPath(path).tab));
	const tabItems = CONFIG_TABS.map((item) => ({ ...item, href: configTabPath(item.id) }));

	let pourDirty = $state(false);
	let discardOpen = $state(false);

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
		// The old Sections page: show its tab's real address.
		if (path.startsWith("/sections")) navigate("/config", { replace: true, force: true });
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

	// Unsaved targets or task roles: leaving asks first, like an editor.
	const dirty = $derived(pourDirty || tasksDirty);

	$effect(() => {
		setUnsavedGuard(dirty, () => (discardOpen = true));
	});

	$effect(() => {
		if (!dirty || typeof window === "undefined") return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	});

	onDestroy(() => clearUnsavedGuard());

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

	const baserowHref = $derived(
		connection?.databaseId
			? `https://baserow.io/database/${connection.databaseId}/`
			: "",
	);
</script>

<div class="page scrollbar-fade">
	<PageHeader title="Configuration" subtitle="How the menu is laid out, house targets, and who gets event tasks.">
		{#snippet toolbar()}
			<Segmented value={tab} items={tabItems} tone="soft" size="sm" ariaLabel="Configuration" />
		{/snippet}
	</PageHeader>

	<!-- Every tab stays mounted so unsaved edits survive a tab switch; the page's guard covers them all. -->
	<div class="panel wide" hidden={tab !== "sections"}>
		<SectionsTab />
	</div>

	<div class="panel" hidden={tab !== "pour"}>
		<p class="lead">Ingredient cost as a share of selling price, by drink type. Recipe analysis and the dashboard flag drinks above their target.</p>
		{#if pourSettings.loaded}
			<div in:fly={{ y: waited ? 10 : 0, duration: waited ? flyMs : 0, easing: easeOut }}>
				<Card>
					<PourTargetsForm idPrefix="config-pour" bind:dirty={pourDirty} />
				</Card>
			</div>
		{/if}
	</div>

	<div class="panel" hidden={tab !== "tasks"}>
		<p class="lead">Who gets the social post for each event, and which ClickUp list it lands in.</p>
		<Card>
			<form class="tasks" novalidate onsubmit={saveTasks}>
				<div class="field-grid">
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
				</div>
				<div class="task-actions">
					{#if tasksDirty}<span class="unsaved">Unsaved changes</span>{/if}
					<Button
						variant="primary"
						size="sm"
						type="submit"
						busy={savingTasks}
						disabled={savingTasks || !tasksDirty}
						reason={!savingTasks && !tasksDirty ? "No changes to save" : undefined}
					>
						{#snippet icon()}<Icon name="save" size={14} />{/snippet}
						Save task roles
					</Button>
				</div>
			</form>
		</Card>
	</div>

	<div class="panel" hidden={tab !== "environment"}>
		<p class="lead">Which Baserow database this ops session writes to.</p>
		{#if connection}
			<Card>
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
							<dd>This is a local copy working on live data. Changes affect the real website.</dd>
						</div>
					{/if}
				</dl>
			</Card>
		{/if}
	</div>

	<BusyOverlay active={tab === "pour" && !pourSettings.loaded} label="Loading…" />
	<ConfirmDialog
		open={discardOpen}
		title="Discard unsaved changes?"
		message="Settings you've changed here haven't been saved. They will be lost."
		action="Discard"
		cancelLabel="Keep editing"
		oncancel={keepEditing}
		onconfirm={discardAndLeave}
	/>
</div>

<style>
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	/* Every tab uses the page width; fields keep their own widths inside. */
	.panel {
		display: grid;
		gap: var(--space-4);
		align-content: start;
	}

	/* display: grid would otherwise beat the hidden attribute and show every tab. */
	.panel[hidden] {
		display: none;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: var(--space-4) var(--space-6);
		align-items: start;
	}

	.lead {
		margin: 0;
		max-width: 65ch;
		font-size: var(--text-sm);
		color: var(--fg-muted);
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
		padding-top: var(--space-4);
		border-top: 1px solid var(--border);
	}

	.unsaved {
		margin-right: auto;
		font-size: var(--text-sm);
		color: var(--warning);
	}

	.env-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: var(--space-3) var(--space-6);
		margin: 0;
	}

	.env-grid > div {
		display: grid;
		gap: 0.2rem;
	}

	.env-grid .span {
		grid-column: 1 / -1;
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
