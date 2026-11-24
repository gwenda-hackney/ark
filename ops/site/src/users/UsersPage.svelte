<script lang="ts">
	/**
	 * Users: who can sign in (People), and what they can do (#375): each
	 * person's role, and the Roles tab. Owners change roles and give people
	 * them; everyone else with Users can look.
	 */
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
		Dialog,
		NativeSelect,
		Button,
		Confirm,
		ConfirmDialog,
		EmptyState,
		Field,
		FormErrors,
		PageDrawer,
		PageHeader,
		RowAction,
		Skeleton,
		Switch,
		TextField,
	} from "../ui";
	import {
		createOpsUser,
		deleteOpsUser,
		getOpsUsers,
		getRoles,
		updateOpsUser,
		type AuthMe,
	} from "../app/api";
	import { navTabs } from "../app/nav-routes";
	import { SHELL_MOBILE_QUERY, mediaMatches } from "../ui/viewport.svelte";
	import RolesList from "./RolesList.svelte";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import type { OpsRole, OpsUser } from "./types";
	import { roleSummary } from "./role-summary";

	let { me, view = "people" }: { me: AuthMe; view?: "people" | "roles" } = $props();

	/** Only owners change roles and who has which. */
	const isOwner = $derived(Boolean(me?.access?.owner));
	const NOT_OWNER = "Only owners can change roles";
	const phone = mediaMatches(SHELL_MOBILE_QUERY);

	let roles = $state<OpsRole[]>([]);
	const defaultRole = $derived(roles.find((role) => role.isDefault) || null);
	function roleOf(user: OpsUser): OpsRole | null {
		return roles.find((role) => role.id === user.roleId) || defaultRole;
	}
	// Editing one person (a row, or its pencil): their name and role. What
	// they can do is their role's alone; only owners change it.
	let editFor = $state<OpsUser | null>(null);
	let editName = $state("");
	let editRoleId = $state("");
	let editSaving = $state(false);
	function openEdit(user: OpsUser) {
		editFor = user;
		editName = user.name && user.name !== user.email ? user.name : "";
		editRoleId = String(user.roleId ?? defaultRole?.id ?? "");
	}
	const editRole = $derived(roles.find((role) => String(role.id) === editRoleId) || null);
	async function saveEdit() {
		if (!editFor) return;
		const id = String(editFor.id || editFor._id || "");
		const roleId = editRoleId ? Number(editRoleId) : null;
		const roleChanged = roleId !== (editFor.roleId ?? defaultRole?.id ?? null);
		editSaving = true;
		try {
			const data = await updateOpsUser(id, {
				name: editName.trim() || editFor.email,
				...(isOwner && roleChanged ? { roleId } : {}),
			});
			users = users.map((row) => (String(row.id) === id ? data.user : row));
			toast.ok(`${data.user.name || data.user.email} saved.`);
			editFor = null;
			if (roleChanged) void loadRoles();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save them.");
		} finally {
			editSaving = false;
		}
	}
	async function loadRoles() {
		try {
			roles = (await getRoles()).roles;
		} catch {
			roles = [];
		}
	}

	let users = $state<OpsUser[]>([]);
	let loading = $state(true);
	let loadError = $state("");
	let drawerOpen = $state(false);
	let saving = $state(false);
	let error = $state("");
	let name = $state("");
	let email = $state("");
	let busyId = $state("");
	const confirm = new Confirm();
	const errors = new FormErrors();

	const activeCount = $derived(users.filter((user) => user.active).length);
	const summary = $derived(
		users.length === activeCount
			? `${users.length} ${users.length === 1 ? "person" : "people"}`
			: `${users.length} people · ${activeCount} can sign in`,
	);

	async function reload() {
		loading = true;
		loadError = "";
		try {
			const data = await getOpsUsers();
			users = data.users || [];
		} catch (err) {
			loadError = err instanceof Error ? err.message : "Could not load users.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void reload();
		void loadRoles();
	});

	function openDrawer() {
		name = "";
		email = "";
		newRoleId = String(defaultRole?.id ?? "");
		error = "";
		errors.clearAll();
		drawerOpen = true;
	}

	function closeDrawer() {
		if (saving) return;
		drawerOpen = false;
	}

	/** The role a new person starts with: the default role unless an owner picks another. */
	let newRoleId = $state("");

	async function onAdd(event: Event) {
		event.preventDefault();
		const address = email.trim();
		errors.replace({
			"user-email": !address
				? "Add their email address."
				: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)
					? ""
					: "Use a whole email address, like name@gwenda.co.uk.",
		});
		if (errors.count) {
			void errors.reveal();
			return;
		}
		saving = true;
		error = "";
		try {
			const data = await createOpsUser({
				name: name.trim() || undefined,
				email: email.trim(),
				active: true,
				// Only owners give roles; anyone else's new person has the default.
				...(isOwner && newRoleId && newRoleId !== String(defaultRole?.id ?? "") ? { roleId: Number(newRoleId) } : {}),
			});
			users = [...users, data.user].sort((a, b) =>
				String(a.email).localeCompare(String(b.email)),
			);
			toast.ok("User added.");
			saving = false;
			closeDrawer();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not add user.";
			error = message;
			toast.error(message);
		} finally {
			saving = false;
		}
	}

	async function onToggle(user: OpsUser) {
		const id = String(user.id || user._id || "");
		if (!id) return;
		busyId = id;
		try {
			const data = await updateOpsUser(id, { active: !user.active });
			users = users.map((row) => (String(row.id) === id ? data.user : row));
			toast.ok(data.user.active ? "User can sign in." : "User can no longer sign in.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not update user.");
		} finally {
			busyId = "";
		}
	}

	async function onRemove(user: OpsUser) {
		const id = String(user.id || user._id || "");
		if (!id) return;
		const label = user.name || user.email || "this user";
		const ok = await confirm.ask({
			title: `Delete ${label}?`,
			message: "They can no longer sign in to ops. To pause them instead, turn off Can sign in.",
			action: "Delete",
		});
		if (!ok) return;
		busyId = id;
		try {
			await deleteOpsUser(id);
			users = users.filter((row) => String(row.id) !== id);
			toast.ok("User deleted.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not delete user.");
		} finally {
			busyId = "";
		}
	}

	function initial(user: OpsUser): string {
		const source = (user.name || user.email || "").trim();
		return source ? source.charAt(0).toUpperCase() : "?";
	}
</script>

<div class="page scrollbar-fade">
	<PageHeader
		title="Users"
		subtitle="Who can sign in to ops, and what they can do."
		tabs={{ items: navTabs("users"), value: view }}
	>
		{#snippet actions()}
			<Button type="button" disabled={view !== "people"} reason="Add people on the People tab" onclick={openDrawer}>
				{#snippet icon()}
					<Icon name="plus" size={16} />
				{/snippet}
				Add user
			</Button>
		{/snippet}
	</PageHeader>

	{#if view === "roles"}
		<RolesList canEdit={isOwner} />
	{:else if loadError}
		<EmptyState tone="error" title="Could not load users" text={loadError}>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => void reload()}>{#snippet icon()}<Icon name="refresh" size={14} />{/snippet}Try again</Button>
			{/snippet}
		</EmptyState>
	{:else if loading && users.length === 0}
		<Skeleton rows={3} thumb lines={1} label="Loading users…" />
	{:else if users.length === 0}
		<EmptyState icon="users" title="No one added yet" text="Add the people who may sign in with Google.">
			{#snippet action()}
				<Button size="sm" onclick={openDrawer}>{#snippet icon()}<Icon name="plus" size={14} />{/snippet}Add the first user</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<p class="count">{summary}</p>
		<table class="table" in:fly={{ y: 10, duration: flyMs, easing: easeOut }}>
			<thead>
				<tr>
					<th scope="col">Person</th>
					<th scope="col">Role</th>
					<th scope="col">Can sign in</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each users as user (user.id)}
					{@const busy = busyId === String(user.id)}
					{@const role = roleOf(user)}
					<tr class="editable" class:off={!user.active} onclick={() => openEdit(user)}>
						<td class="person">
							<div class="person-inner">
								<span class="avatar" aria-hidden="true">{initial(user)}</span>
								<span class="who">
									<span class="name">{user.name || user.email}</span>
									{#if user.name && user.name !== user.email}
										<span class="email">{user.email}</span>
									{/if}
								</span>
							</div>
						</td>
						<td class="roles" data-label="Role">
							<span class="role-cell">
								<Badge tone={role?.owner ? "success" : "neutral"} label={role?.name || "…"} />
							</span>
						</td>
						<!-- Its own control: switching sign-in doesn't open the person. -->
						<td class="status" data-label="Can sign in" onclick={(event) => event.stopPropagation()}>
							<span class="access">
								<Switch
									checked={Boolean(user.active)}
									disabled={busy}
									ariaLabel="{user.email} can sign in"
									onchange={() => onToggle(user)}
								/>
								<Badge tone={user.active ? "success" : "neutral"} label={user.active ? "Yes" : "No"} />
							</span>
						</td>
						<td class="row-actions" onclick={(event) => event.stopPropagation()}>
							<RowAction icon="pencil" label="Edit {user.email}" disabled={busy} reason="Saving…" onclick={() => openEdit(user)} />
							<RowAction label="Delete {user.email}" disabled={busy} reason="Saving…" onclick={() => onRemove(user)} />
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<!-- First load shows skeleton rows; the overlay covers a reload. -->
	<BusyOverlay active={loading && users.length > 0} label="Loading…" />
</div>

<PageDrawer open={drawerOpen} onclose={closeDrawer} title="Add user">
	<form class="add" novalidate onsubmit={onAdd}>
		<p class="intro">
			They sign in with Google, so use the email address of their Google account.
		</p>
		<Field label="Name" for="user-name" optional>
			<TextField id="user-name" bind:value={name} autocomplete="off" />
		</Field>
		<Field
			label="Email"
			for="user-email"
			required
			error={errors.get("user-email")}
			hint="Their Google account."
		>
			<TextField
				id="user-email"
				bind:value={email}
				type="email"
				inputmode="email"
				placeholder="name@gwenda.co.uk"
				autocomplete="off"
				spellcheck="false"
				oninput={() => errors.clear("user-email")}
			/>
		</Field>
		<Field label="Role" for="new-user-role" hint={isOwner ? "What they can do in ops. Change it later with Change." : NOT_OWNER}>
			<NativeSelect
				id="new-user-role"
				bind:value={newRoleId}
				disabled={!isOwner || !roles.length}
				options={roles.map((role) => ({ value: String(role.id), label: role.isDefault ? `${role.name} (everyone's, until given another)` : role.name }))}
			/>
		</Field>
		{#if error}
			<p class="error">{error}</p>
		{/if}
		<div class="actions">
			<Button variant="ghost" type="button" disabled={saving} onclick={closeDrawer}>
				{#snippet icon()}<Icon name="close" size={16} />{/snippet}
				Cancel
			</Button>
			<Button type="submit" variant="primary" busy={saving}>{#snippet icon()}<Icon name="plus" size={16} />{/snippet}Add user</Button>
		</div>
	</form>
</PageDrawer>

<ConfirmDialog {confirm} />

<Dialog open={editFor !== null} sheet={phone.matches} title="Edit user" onclose={() => !editSaving && (editFor = null)}>
	{#if editFor}
		<form class="edit" novalidate onsubmit={(event) => { event.preventDefault(); void saveEdit(); }}>
			<p class="edit-email">{editFor.email}</p>
			<Field label="Name" for="edit-user-name" optional>
				<TextField id="edit-user-name" bind:value={editName} autocomplete="off" />
			</Field>
			<Field label="Role" for="edit-user-role" hint={!isOwner ? NOT_OWNER : editRole ? `${roleSummary(editRole)}. Change what a role can do on the Roles tab.` : ""}>
				<NativeSelect id="edit-user-role" bind:value={editRoleId} disabled={!isOwner} options={roles.map((role) => ({ value: String(role.id), label: role.isDefault ? `${role.name} (everyone's, until given another)` : role.name }))} />
			</Field>
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" disabled={editSaving} onclick={() => (editFor = null)}>Cancel</Button>
		<Button variant="primary" busy={editSaving} onclick={() => void saveEdit()}>
			{#snippet icon()}<Icon name="check" size={14} />{/snippet}
			Save
		</Button>
	{/snippet}
</Dialog>

<style>
	.role-cell {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.page {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.count {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.table th,
	.table td {
		padding: var(--space-3) var(--space-2);
		text-align: left;
		vertical-align: middle;
		border-bottom: 1px solid var(--border);
	}

	.table th:first-child,
	.table td:first-child {
		padding-left: var(--space-3);
	}

	.table th:last-child,
	.table td:last-child {
		padding-right: var(--space-3);
	}

	.table th {
		background: var(--surface-1);
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.table tbody tr:hover {
		background: var(--surface-3);
	}

	.table tbody tr.editable {
		cursor: pointer;
	}

	.edit {
		display: grid;
		gap: var(--space-4);
	}

	.edit-email {
		margin: 0;
		color: var(--fg-muted);
		font-size: var(--text-sm);
	}

	/* The flex row lives inside the cell: a flex td stops being a table
	   cell, and its bottom border then ends short of the row. */
	.person-inner {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.avatar {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		background: var(--primary-wash);
		color: var(--primary);
		font-weight: 600;
	}

	.who {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.name {
		font-size: var(--text-base);
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.email {
		color: var(--muted-foreground);
		overflow-wrap: anywhere;
	}

	tr.off .avatar {
		background: var(--muted);
		color: var(--muted-foreground);
	}

	tr.off .name {
		color: var(--muted-foreground);
	}

	.access {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.row-actions {
		width: 1%;
		text-align: right;
		white-space: nowrap;
	}

	/* Phones: each person is a card instead of a squeezed row. */
	@media (max-width: 900px) {
		.table,
		.table tbody {
			display: grid;
			gap: var(--space-2);
		}

		.table thead {
			display: none;
		}

		.table tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: var(--space-3);
			padding: var(--space-3);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			background: var(--panel-bg);
		}

		.table tbody tr:hover {
			background: var(--surface-1);
		}

		.table td,
		.table td:first-child,
		.table td:last-child {
			padding: 0;
			border-bottom: 0;
		}

		.person {
			grid-column: 1;
		}

		.name {
			font-size: var(--text-base);
		}

		.email {
			font-size: var(--text-sm);
		}

		.row-actions {
			grid-column: 2;
			grid-row: 1;
			width: auto;
		}

		.roles,
		.status {
			grid-column: 1 / -1;
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 2.75rem;
			padding-top: var(--space-1) !important;
			border-top: 1px solid var(--border) !important;
		}

		.roles::before,
		.status::before {
			content: attr(data-label);
			font-size: var(--text-2xs);
			font-weight: 600;
			letter-spacing: var(--tracking-label);
			text-transform: uppercase;
			color: var(--fg-muted);
		}
	}

	.add {
		display: grid;
		gap: var(--space-4);
	}

	.intro {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
