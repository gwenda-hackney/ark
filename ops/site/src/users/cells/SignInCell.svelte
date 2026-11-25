<script lang="ts">
	/** Users table: can they sign in? A switch of its own (switching doesn't open the person). */
	import Badge from "../../ui/Badge.svelte";
	import Switch from "../../ui/Switch.svelte";

	let { active = false, email = "", busy = false, ontoggle }: { active?: boolean; email?: string; busy?: boolean; ontoggle?: () => void } = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<span class="access" onclick={(event) => event.stopPropagation()}>
	<Switch checked={active} disabled={busy} ariaLabel="{email} can sign in" onchange={() => ontoggle?.()} />
	<Badge tone={active ? "success" : "neutral"} label={active ? "Yes" : "No"} />
</span>

<style>
	.access {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		height: 100%;
	}
</style>
