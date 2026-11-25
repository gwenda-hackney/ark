<script lang="ts">
	/**
	 * Users: who can sign in (People), and what they can do (#375): each
	 * person's role, and the Roles tab. Owners change roles and give people
	 * them; everyone else with Users can look.
	 */
	import { onMount } from "svelte";
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
		ListPage,
		Skeleton,
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
	import UsersGrid from "./UsersGrid.svelte";
	import RolesList from "./RolesList.svelte";
	import { toast } from "../ui/toast.svelte";
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

</script>

<ListPage
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
		<UsersGrid {users} {busyId} {roleOf} onedit={openEdit} ontoggle={(user) => void onToggle(user)} onremove={(user) => void onRemove(user)} />
	{/if}

	<!-- First load shows skeleton rows; the overlay covers a reload. -->
	<BusyOverlay active={loading && users.length > 0} label="Loading…" />
</ListPage>

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
		<Field label="Role" for="new-user-role" hint={isOwner ? "What they can do in ops. You can change it later: click their row." : NOT_OWNER}>
			<NativeSelect
				id="new-user-role"
				bind:value={newRoleId}
				disabled={!isOwner || !roles.length}
				options={roles.map((role) => ({ value: String(role.id), label: role.isDefault ? `${role.name} (new people get this)` : role.name }))}
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
				<NativeSelect id="edit-user-role" bind:value={editRoleId} disabled={!isOwner} options={roles.map((role) => ({ value: String(role.id), label: role.isDefault ? `${role.name} (new people get this)` : role.name }))} />
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
	.count {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		color: var(--fg-muted);
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
