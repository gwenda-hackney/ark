<script lang="ts">
	/**
	 * Fixed toast stack. Outcomes only — in-flight work uses BusyOverlay.
	 */
	import { fly } from "svelte/transition";
	import { dismiss, getToasts } from "./toast.svelte";
	import { portal } from "./portal";

	function easeOut(t: number): number {
		return 1 - Math.pow(1 - t, 3.2);
	}

	const toasts = $derived(getToasts());
</script>

{#if toasts.length}
	<div class="stack" use:portal aria-live="polite" aria-relevant="additions">
		{#each toasts as t (t.id)}
			<div
				class="toast {t.kind}"
				role={t.kind === "error" ? "alert" : "status"}
				in:fly={{ y: 12, duration: 220, easing: easeOut }}
				out:fly={{ y: 8, duration: 160, easing: easeOut }}
			>
				<p class="msg">{t.message}</p>
				<button
					type="button"
					class="x"
					aria-label="Dismiss"
					onclick={() => dismiss(t.id)}
				>
					×
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.stack {
		position: fixed;
		right: max(1rem, env(safe-area-inset-right));
		bottom: max(1rem, env(safe-area-inset-bottom));
		z-index: 320;
		display: grid;
		gap: 0.55rem;
		width: min(24rem, calc(100vw - 2rem));
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: start;
		gap: 0.65rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		background: var(--card);
		color: var(--foreground);
		box-shadow: var(--shadow);
	}

	.toast.ok {
		border-color: color-mix(in srgb, var(--up) 45%, transparent);
		background: color-mix(in srgb, var(--up) 10%, var(--card));
	}

	.toast.error {
		border-color: color-mix(in srgb, var(--destructive) 50%, transparent);
		background: var(--destructive-wash);
	}

	.toast.info {
		border-color: var(--border-strong);
	}

	.msg {
		margin: 0;
		font-size: var(--text);
		line-height: 1.45;
	}

	.toast.ok .msg {
		color: color-mix(in srgb, var(--up) 75%, var(--foreground));
	}

	.toast.error .msg {
		color: color-mix(in srgb, var(--destructive) 85%, var(--foreground));
	}

	.x {
		margin: -0.15rem -0.2rem 0 0;
		padding: 0 0.35rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted-foreground);
		font-size: 1.1rem;
		line-height: 1.2;
		cursor: pointer;
	}

	.x:hover {
		color: var(--foreground);
		background: var(--accent);
	}
</style>
