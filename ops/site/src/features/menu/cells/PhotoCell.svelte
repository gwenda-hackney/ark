<script lang="ts">
	let {
		url = "",
		alt = "",
		size = "sm",
	}: {
		url?: string;
		alt?: string;
		size?: "sm" | "md" | "lg";
	} = $props();

	/** Sanity CDN can crop; Baserow files cannot — leave those alone. */
	const src = $derived.by(() => {
		const raw = String(url || "").trim();
		if (!raw) return "";
		if (!raw.includes("cdn.sanity.io")) return raw;
		const base = raw.split("?")[0] || raw;
		const px = size === "lg" ? 144 : 96;
		return `${base}?w=${px}&h=${px}&fit=crop&auto=format`;
	});
</script>

{#if src}
	<img class="thumb {size}" {src} {alt} loading="lazy" decoding="async" />
{:else}
	<span class="spacer {size}" aria-hidden="true"></span>
{/if}

<style>
	.thumb {
		display: block;
		flex-shrink: 0;
		object-fit: cover;
		object-position: center center;
		border-radius: 0.4rem;
		background: var(--sunken);
	}

	.sm {
		width: 1.75rem;
		height: 1.75rem;
	}

	.md {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.5rem;
	}

	.lg {
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.55rem;
	}

	/* Keeps the column aligned without a hollow box that reads as a checkbox. */
	.spacer {
		display: block;
		flex-shrink: 0;
	}
</style>
