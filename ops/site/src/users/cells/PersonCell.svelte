<script lang="ts">
	/** Users table: the person's initial, their name, and their email under it. */
	let { name = "", email = "" }: { name?: string; email?: string } = $props();
	const initial = $derived(((name || email).trim().charAt(0) || "?").toUpperCase());
</script>

<span class="person">
	<span class="avatar" aria-hidden="true">{initial}</span>
	<span class="who">
		<span class="name">{name || email}</span>
		{#if name && name !== email}<span class="email">{email}</span>{/if}
	</span>
</span>

<style>
	.person {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		height: 100%;
	}
	.avatar {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: var(--primary-wash);
		color: var(--primary);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.3;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.email {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
</style>
