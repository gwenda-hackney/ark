<script lang="ts">
	import { onMount } from "svelte";
	import { Icon } from "../../shell";
	import {
		BusyOverlay,
		Button,
		Card,
		PageHeader,
		TextField,
	} from "../../ui";
	import {
		createOpsUser,
		deleteOpsUser,
		getOpsUsers,
		updateOpsUser,
	} from "../../lib/api";
	import { toast } from "../../lib/toast.svelte";
	import type { OpsUser } from "../../lib/types";

	let users = $state<OpsUser[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state("");
	let name = $state("");
	let email = $state("");
	let busyId = $state("");

	async function reload() {
		loading = true;
		error = "";
		try {
			const data = await getOpsUsers();
			users = data.users || [];
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load users.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void reload();
	});

	async function onAdd(event: Event) {
		event.preventDefault();
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
			name = "";
			email = "";
			toast.ok("User added.");
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
			toast.ok(data.user.active ? "User active." : "User deactivated.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not update user.");
		} finally {
			busyId = "";
		}
	}

	async function onRemove(user: OpsUser) {
		const id = String(user.id || user._id || "");
		if (!id) return;
		const label = user.email || "this user";
		if (!window.confirm(`Remove ${label} from ops?`)) return;
		busyId = id;
		try {
			await deleteOpsUser(id);
			users = users.filter((row) => String(row.id) !== id);
			toast.ok("User removed.");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Could not remove user.");
		} finally {
			busyId = "";
		}
	}
</script>

<div class="page">
	<PageHeader
		title="Users"
		subtitle="Who may sign in to ops with Google. Active emails only."
	/>

	<div class="stack">
		<Card title="Add person" subtitle="Use their Google account email.">
			<form class="add" onsubmit={onAdd}>
				<label class="field">
					<span class="label">Name</span>
					<TextField bind:value={name} placeholder="Optional" autocomplete="name" />
				</label>
				<label class="field">
					<span class="label">Email</span>
					<TextField
						bind:value={email}
						type="email"
						placeholder="you@gwenda.co.uk"
						autocomplete="email"
						required
					/>
				</label>
				<div class="actions">
					<Button type="submit" variant="primary" busy={saving}>Add</Button>
				</div>
			</form>
			{#if error}
				<p class="error">{error}</p>
			{/if}
		</Card>

		<Card title="People" subtitle="{users.length} on the list">
			{#if loading}
				<p class="muted">Loading…</p>
			{:else if users.length === 0}
				<p class="muted">No users yet. Add someone above.</p>
			{:else}
				<ul class="list">
					{#each users as user (user.id)}
						<li class="row" class:off={!user.active}>
							<div class="copy">
								<span class="email">{user.email}</span>
								{#if user.name && user.name !== user.email}
									<span class="name">{user.name}</span>
								{/if}
							</div>
							<div class="row-actions">
								<label class="active">
									<input
										type="checkbox"
										checked={user.active}
										disabled={busyId === String(user.id)}
										onchange={() => onToggle(user)}
									/>
									<span>Active</span>
								</label>
								<Button
									variant="ghost"
									size="sm"
									disabled={busyId === String(user.id)}
									onclick={() => onRemove(user)}
									aria-label="Remove {user.email}"
								>
									{#snippet icon()}
										<Icon name="trash" size={16} />
									{/snippet}
								</Button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>
	</div>

	<BusyOverlay open={Boolean(busyId) || saving} label={saving ? "Adding…" : "Saving…"} />
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--page-gutter);
	}

	.stack {
		display: grid;
		gap: var(--gap-lg);
		max-width: 40rem;
		align-content: start;
	}

	.add {
		display: grid;
		gap: var(--gap-md);
	}

	.field {
		display: grid;
		gap: 0.35rem;
	}

	.label {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
	}

	.error {
		margin: var(--gap-sm) 0 0;
		color: var(--destructive, #c97a7a);
		font-size: var(--text-sm);
	}

	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.35rem;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.35rem;
		border-bottom: 1px solid var(--border);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.row.off .email {
		color: var(--muted-foreground);
	}

	.copy {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.email {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.name {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.active {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		cursor: pointer;
		user-select: none;
	}

	.active input {
		accent-color: var(--primary);
	}
</style>
