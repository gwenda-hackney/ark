<script lang="ts">
	/** Send me a test: this week's email to your own address, nobody else's. */
	import { Icon } from "../app/shell";
	import { Button } from "../ui";
	import { sendWeeklyEmailTest, type WeeklyEmailStatus } from "./email-api";
	import { testBlockedReason } from "./email-view";

	let { status, hasEmail }: { status: WeeklyEmailStatus | null; hasEmail: boolean } = $props();

	let busy = $state(false);
	let result = $state<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
	const blocked = $derived(testBlockedReason(status, hasEmail));

	async function send() {
		busy = true;
		result = null;
		try {
			const sent = await sendWeeklyEmailTest();
			result = sent.warning
				? { tone: "warn", text: sent.warning }
				: { tone: "ok", text: `Sent to ${sent.sentTo}. It can take a minute to arrive.` };
		} catch (err) {
			result = { tone: "error", text: err instanceof Error ? err.message : "The test didn't send." };
		} finally {
			busy = false;
		}
	}
</script>

<section class="card" aria-labelledby="email-test-title">
	<h2 id="email-test-title">Send me a test</h2>
	<p class="muted">
		This week's email, to {status?.me.email || "your own address"} only. The mailing list gets nothing.
	</p>
	<div class="row">
		<Button variant="outline" size="sm" {busy} disabled={Boolean(blocked) || busy} reason={blocked} onclick={() => void send()}>
			{#snippet icon()}
				<Icon name="send" size={16} />
			{/snippet}
			Send me a test
		</Button>
	</div>
	<p class="result {result?.tone || (blocked ? 'muted-line' : '')}" role="status">
		{result?.text || blocked || " "}
	</p>
</section>

<style>
	.card {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--panel-bg);
	}
	h2 {
		margin: 0;
		font-size: var(--text-base);
	}
	.muted {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}
	.row {
		display: flex;
	}
	.result {
		margin: 0;
		min-height: 1.4em;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
		overflow-wrap: anywhere;
	}
	.result.ok {
		color: var(--success, var(--foreground));
	}
	.result.error {
		color: var(--destructive);
	}
	.result.warn {
		color: var(--warning, var(--foreground));
	}
</style>
