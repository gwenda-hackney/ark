<script lang="ts">
	/**
	 * Users → Roles (#375): every role, what it can do and how many have it.
	 * A row opens the role: its name and None, View or Edit for each area of
	 * ops (access/areas.js). Owners change roles; anyone else can look. The
	 * Owner role has everything and the default role can't be removed.
	 */
	import type { ColDef, ICellRendererParams } from "ag-grid-community";
	import { Icon } from "../app/shell";
	import { Badge, Button, Card, DataGrid, Dialog, EmptyState, Field, Segmented, TextField } from "../ui";
	import BadgeCell from "../ui/BadgeCell.svelte";
	import { svelteCell } from "../ui/grid";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import { toast } from "../ui/toast.svelte";
	import { createRole, deleteRole, getRoles, updateRole } from "../app/api";
	import { AREAS } from "../access/areas.js";
	import type { Level, OpsRole } from "./types";
	import { roleSummary } from "./role-summary";

	let { canEdit }: { canEdit: boolean } = $props();

	const phone = mediaMatches(SHELL_MOBILE_QUERY);
	const NOT_OWNER = "Only owners can change roles";

	let roles = $state<OpsRole[]>([]);
	let error = $state("");
	let loaded = $state(false);

	async function load() {
		try {
			roles = (await getRoles()).roles;
			error = "";
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't load the roles.";
		} finally {
			loaded = true;
		}
	}
	$effect(() => {
		void load();
	});

	const labelOf = (id: string) => AREAS.find((area) => area.id === id)?.label || id;

	const summary = roleSummary;

	const columnDefs: ColDef<OpsRole>[] = [
		{ headerName: "Role", field: "name", width: 170, minWidth: 140 },
		{
			headerName: "",
			colId: "kind",
			width: 140,
			cellRenderer: svelteCell(BadgeCell, (params: ICellRendererParams<OpsRole>) => ({
				label: params.data?.owner ? "Everything" : params.data?.isDefault ? "Default" : "",
				tone: params.data?.owner ? "success" : "neutral",
			})),
		},
		{ headerName: "Can do", colId: "summary", flex: 1, minWidth: 240, valueGetter: (p) => (p.data ? summary(p.data) : ""), tooltipValueGetter: (p) => (p.data ? summary(p.data) : "") },
		{ headerName: "People", field: "people", width: 100, type: "numericColumn" },
	];

	// The open role: a copy being edited.
	let editing = $state<{ id: number | null; name: string; areas: Record<string, Level>; owner: boolean; isDefault: boolean } | null>(null);
	let saving = $state(false);
	let nameError = $state("");

	function open(role: OpsRole | null) {
		nameError = "";
		editing = role
			? { id: role.id, name: role.name, areas: Object.fromEntries(AREAS.map((area) => [area.id, role.owner ? "edit" : role.areas[area.id] || "none"])), owner: role.owner, isDefault: role.isDefault }
			: { id: null, name: "", areas: Object.fromEntries(AREAS.map((area) => [area.id, "none"])), owner: false, isDefault: false };
	}

	const locked = $derived(!canEdit || Boolean(editing?.owner));
	const lockedReason = $derived(!canEdit ? NOT_OWNER : editing?.owner ? "The Owner role has everything" : "");
	const LEVEL_ITEMS = [
		{ id: "none", label: "None" },
		{ id: "view", label: "View" },
		{ id: "edit", label: "Edit" },
	];

	async function save() {
		if (!editing || locked) return;
		const name = editing.name.trim();
		if (!name) {
			nameError = "Give the role a name.";
			return;
		}
		saving = true;
		try {
			if (editing.id === null) await createRole({ name, areas: editing.areas });
			else await updateRole(editing.id, { name, areas: editing.areas });
			toast.ok(editing.id === null ? `${name} added.` : `${name} saved.`);
			editing = null;
			await load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save the role.");
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!editing || editing.id === null) return;
		saving = true;
		try {
			await deleteRole(editing.id);
			toast.ok(`${editing.name} removed. Its people have the default role now.`);
			editing = null;
			await load();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't remove the role.");
		} finally {
			saving = false;
		}
	}
</script>

<Card title="Roles" subtitle="What each role can do in ops. Give people a role on the People tab." fill>
	{#snippet actions()}
		<Button size="sm" disabled={!canEdit} reason={NOT_OWNER} onclick={() => open(null)}>
			{#snippet icon()}<Icon name="plus" size={14} />{/snippet}
			Add role
		</Button>
	{/snippet}
	{#if error}
		<EmptyState tone="error" title="Couldn't load the roles" text={error} />
	{:else}
		<DataGrid
			rowData={roles}
			{columnDefs}
			getRowId={(row) => String(row.id)}
			scrollKey="users-roles"
			domLayout="autoHeight"
			onRowClicked={(row: OpsRole) => open(row)}
			gridOptions={{ rowHeight: 56, enableBrowserTooltips: true, overlayNoRowsTemplate: `<span>${loaded ? "No roles" : "Loading…"}</span>` }}
		/>
	{/if}
</Card>

<Dialog open={editing !== null} sheet={phone.matches} size="lg" title={editing?.id === null ? "New role" : editing?.name || "Role"} onclose={() => !saving && (editing = null)}>
	{#if editing}
		<div class="role-form">
			<Field label="Name" for="role-name" required error={nameError}>
				<TextField id="role-name" bind:value={editing.name} disabled={locked || editing.isDefault} oninput={() => (nameError = "")} />
			</Field>
			{#if lockedReason}<p class="note">{lockedReason}.</p>{/if}
			<ul class="areas">
				{#each AREAS as area (area.id)}
					<li>
						<span class="area">
							<span class="area-name">{area.label}{#if area.guarded}<Badge tone="neutral" label="Private" title="Without access they can't even look" />{/if}</span>
							<span class="area-hint">{area.hint}</span>
						</span>
						{#if locked}
							<Badge tone={editing.areas[area.id] === "edit" ? "success" : editing.areas[area.id] === "view" ? "info" : "neutral"} label={LEVEL_ITEMS.find((item) => item.id === editing?.areas[area.id])?.label || "None"} />
						{:else}
							<Segmented size="sm" tone="soft" items={LEVEL_ITEMS} ariaLabel="{area.label} for {editing.name || 'this role'}" bind:value={editing.areas[area.id]} />
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	{#snippet footer()}
		<Button
			variant="ghost"
			disabled={locked || editing?.id === null || Boolean(editing?.isDefault) || saving}
			reason={!canEdit ? NOT_OWNER : editing?.owner ? "The Owner role can't be removed" : editing?.isDefault ? "Everyone without a role has it" : editing?.id === null ? "Not saved yet" : "Saving…"}
			onclick={() => void remove()}
		>
			{#snippet icon()}<Icon name="trash" size={14} />{/snippet}
			Remove role
		</Button>
		<Button variant="primary" busy={saving} disabled={locked} reason={lockedReason} onclick={() => void save()}>
			{#snippet icon()}<Icon name="check" size={14} />{/snippet}
			{editing?.id === null ? "Add role" : "Save role"}
		</Button>
	{/snippet}
</Dialog>

<style>
	.role-form {
		display: grid;
		gap: var(--space-4);
	}
	.areas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.areas li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
	}
	.area {
		display: grid;
		gap: 0.125rem;
		min-width: 0;
	}
	.area-name {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 500;
	}
	.area-hint,
	.note {
		margin: 0;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}
</style>
