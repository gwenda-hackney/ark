<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		Badge,
		BusyOverlay,
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
		updateOpsUser,
	} from "../app/api";
	import { toast } from "../ui/toast.svelte";
	import { easeOut, flyMs } from "../ui/motion";
	import type { OpsUser } from "./types";

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
	});

	function openDrawer() {
		name = "";
		email = "";
		error = "";
		errors.clearAll();
		drawerOpen = true;
	}

	function closeDrawer() {
		if (saving) return;
		drawerOpen = false;
	}

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
		subtitle="Who can sign in to ops with their Google account."
	>
		{#snippet actions()}
			<Button type="button" onclick={openDrawer}>
				{#snippet icon()}
					<Icon name="plus" size={16} />
				{/snippet}
				Add user
			</Button>
		{/snippet}
	</PageHeader>

	{#if loadError}
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
					<th scope="col">Roles</th>
					<th scope="col">Can sign in</th>
					<th scope="col"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody>
				{#each users as user (user.id)}
					{@const busy = busyId === String(user.id)}
					<tr class:off={!user.active}>
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
						<td class="roles" data-label="Roles">
							<Badge tone="neutral" label="No roles yet" />
						</td>
						<td class="status" data-label="Can sign in">
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
						<td class="row-actions">
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

<style>
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
