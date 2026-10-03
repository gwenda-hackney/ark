<script lang="ts">
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { Icon } from "../app/shell";
	import {
		BusyOverlay,
		Button,
		Card,
		Confirm,
		ConfirmDialog,
		Field,
		FormErrors,
		PageDrawer,
		PageHeader,
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

	<Card title="People" subtitle={loading ? "" : summary} flush>
		{#if loadError}
			<p class="state error">{loadError}</p>
		{:else if !loading && users.length === 0}
			<div class="state empty">
				<p>No one has been added yet.</p>
				<Button type="button" variant="outline" size="sm" onclick={openDrawer}>
					Add the first user
				</Button>
			</div>
		{:else if !loading}
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
								<span class="avatar" aria-hidden="true">{initial(user)}</span>
								<span class="who">
									<span class="name">{user.name || user.email}</span>
									{#if user.name && user.name !== user.email}
										<span class="email">{user.email}</span>
									{/if}
								</span>
							</td>
							<td class="roles" data-label="Roles">
								<span class="placeholder">No roles yet</span>
							</td>
							<td class="status" data-label="Can sign in">
								<label class="switch">
									<input
										type="checkbox"
										role="switch"
										checked={user.active}
										disabled={busy}
										onchange={() => onToggle(user)}
										aria-label="{user.email} can sign in"
									/>
									<span class="track" aria-hidden="true"></span>
									<span class="switch-label">{user.active ? "Yes" : "No"}</span>
								</label>
							</td>
							<td class="row-actions">
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onclick={() => onRemove(user)}
									aria-label="Delete {user.email}"
								>
									{#snippet icon()}
										<Icon name="trash" size={16} />
									{/snippet}
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</Card>

	<BusyOverlay active={loading} label="Loading…" />
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
				Cancel
			</Button>
			<Button type="submit" variant="primary" busy={saving}>Add user</Button>
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

	.state {
		margin: 0;
		padding: 1.25rem var(--card-pad);
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.empty {
		display: grid;
		justify-items: start;
		gap: var(--space-3);
	}

	.empty p {
		margin: 0;
	}

	.error {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-sm);
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
		padding-left: var(--card-pad);
	}

	.table th:last-child,
	.table td:last-child {
		padding-right: var(--card-pad);
	}

	.table th {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
		white-space: nowrap;
	}

	.table tbody tr:last-child td {
		border-bottom: 0;
	}

	.table tbody tr:hover {
		background: color-mix(in srgb, var(--foreground) 3%, transparent);
	}

	.person {
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

	.placeholder {
		color: var(--muted-foreground);
		font-style: italic;
	}

	.switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
		user-select: none;
	}

	.switch input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.track {
		position: relative;
		width: 2.2rem;
		height: 1.25rem;
		border-radius: var(--radius-pill);
		background: var(--muted);
		border: 1px solid var(--border);
		transition: background 160ms ease;
	}

	.track::after {
		content: "";
		position: absolute;
		top: 50%;
		left: 0.15rem;
		width: 0.85rem;
		height: 0.85rem;
		border-radius: 50%;
		background: var(--muted-foreground);
		transform: translateY(-50%);
		transition: transform 160ms ease, background 160ms ease;
	}

	.switch input:checked + .track {
		background: var(--primary-wash-strong);
		border-color: var(--primary);
	}

	.switch input:checked + .track::after {
		background: var(--primary);
		transform: translate(0.95rem, -50%);
	}

	.switch input:focus-visible + .track {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}

	.switch input:disabled + .track {
		opacity: 0.5;
	}

	.switch-label {
		color: var(--muted-foreground);
	}

	.row-actions {
		width: 1%;
		text-align: right;
		white-space: nowrap;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* Phones: each person becomes a small block instead of a squeezed row. */
	@media (max-width: 640px) {
		.table thead {
			display: none;
		}

		.table tbody tr {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: var(--space-2) var(--space-3);
			padding: 0.8rem var(--card-pad);
			border-bottom: 1px solid var(--border);
		}

		.table tbody tr:last-child {
			border-bottom: 0;
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
			padding-left: 2.8rem !important;
		}

		.roles::before,
		.status::before {
			content: attr(data-label);
			font-size: var(--text-2xs);
			font-weight: 600;
			letter-spacing: var(--tracking-label);
			text-transform: uppercase;
			color: var(--muted-foreground);
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
