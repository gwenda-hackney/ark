<script lang="ts">
	/**
	 * This week: where the email is, when the next goes and to how many, the
	 * three things an admin can do, and a test to yourself. The buttons are
	 * always there; one that can't be pressed says why.
	 */
	import { Icon } from "../app/shell";
	import { Badge, Button, Card, Confirm, ConfirmDialog } from "../ui";
	import {
		approveWeeklyEmail,
		getWeeklyEmailAudience,
		prepareWeeklyEmail,
		sendWeeklyEmailAgain,
		sendWeeklyEmailTest,
		type WeeklyEmailStatus,
	} from "./email-api";
	import {
		approveBlockedReason,
		audienceLine,
		howLine,
		nextLine,
		sendAgainBlockedReason,
		statusLine,
		testBlockedReason,
		tryAgainBlockedReason,
	} from "./email-view";

	let {
		status,
		hasEmail,
		onchange,
	}: { status: WeeklyEmailStatus | null; hasEmail: boolean; onchange: (status: WeeklyEmailStatus) => void } = $props();

	const confirm = new Confirm();
	let busy = $state("");
	let error = $state("");

	const now = $derived(status ? statusLine(status) : null);

	// How many the next one goes to: everyone subscribed right now. Only production reaches the list.
	let subscribed = $state<number | null>(null);
	let subscribedError = $state(false);
	const reachesList = $derived(Boolean(status?.access.audience));
	$effect(() => {
		if (!reachesList || !status?.me.isAdmin) return;
		getWeeklyEmailAudience()
			.then(({ audience }) => (subscribed = audience.memberCount))
			.catch(() => (subscribedError = true));
	});
	const toLine = $derived(
		!status ? "…"
		: !reachesList ? "Production only"
		: !status.settings.sending || !status.me.isAdmin ? "—"
		: subscribed !== null ? `${audienceLine(subscribed)} (subscribed now)`
		: subscribedError ? "Couldn't ask Mailchimp"
		: "…",
	);
	const approveBlocked = $derived(approveBlockedReason(status));
	const tryAgainBlocked = $derived(tryAgainBlockedReason(status));
	const sendAgainBlocked = $derived(sendAgainBlockedReason(status));

	/** Ask Mailchimp how many it goes to, then ask the admin, then do it. */
	async function confirmedSend(kind: "approve" | "again") {
		if (!status) return;
		busy = kind;
		error = "";
		try {
			const { audience } = await getWeeklyEmailAudience();
			subscribed = audience.memberCount;
			const to = audienceLine(audience.memberCount);
			const after = status.current?.id ?? 0;
			await confirm.run(
				kind === "approve"
					? {
							title: `Send this week's email to ${to}?`,
							message: "As the preview shows it. Can't be undone.",
							action: "Approve and send",
							tone: "primary",
						}
					: {
							title: `Send it again to ${to}?`,
							message: "Everyone gets it a second time. Can't be undone.",
							action: "Send again",
							tone: "destructive",
						},
				async () => onchange(kind === "approve" ? await approveWeeklyEmail() : await sendWeeklyEmailAgain(after)),
			);
		} catch (err) {
			error = err instanceof Error ? err.message : "That didn't work.";
		} finally {
			busy = "";
		}
	}

	let testResult = $state<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
	const testBlocked = $derived(testBlockedReason(status, hasEmail));

	async function sendTest() {
		busy = "test";
		testResult = null;
		try {
			const sent = await sendWeeklyEmailTest();
			testResult = sent.warning
				? { tone: "warn", text: sent.warning }
				: { tone: "ok", text: `Sent to ${sent.sentTo} · can take a minute` };
		} catch (err) {
			testResult = { tone: "error", text: err instanceof Error ? err.message : "The test didn't send." };
		} finally {
			busy = "";
		}
	}

	async function tryAgain() {
		busy = "prepare";
		error = "";
		try {
			onchange(await prepareWeeklyEmail());
		} catch (err) {
			error = err instanceof Error ? err.message : "That didn't work.";
		} finally {
			busy = "";
		}
	}
</script>

<Card title="This week">
	<div class="now">
		<Badge tone={now?.tone || "neutral"} label={now?.label || "Loading…"} />
		{#if now?.detail}<p class="detail">{now.detail}</p>{/if}
	</div>
	<dl class="facts">
		<dt>How</dt>
		<dd>{status ? howLine(status.settings) : "…"}</dd>
		<dt>Next</dt>
		<dd>{status ? nextLine(status) : "…"}</dd>
		<dt>To</dt>
		<dd>{toLine}</dd>
	</dl>

	<div class="buttons">
		<Button
			size="sm"
			busy={busy === "approve"}
			disabled={Boolean(approveBlocked) || Boolean(busy)}
			reason={approveBlocked}
			onclick={() => void confirmedSend("approve")}
		>
			{#snippet icon()}<Icon name="send" size={16} />{/snippet}
			Approve and send
		</Button>
		<Button
			variant="outline"
			size="sm"
			busy={busy === "prepare"}
			disabled={Boolean(tryAgainBlocked) || Boolean(busy)}
			reason={tryAgainBlocked}
			title="Rebuilds this week's, then waits for approval"
			onclick={() => void tryAgain()}
		>
			{#snippet icon()}<Icon name="refresh" size={16} />{/snippet}
			Try again
		</Button>
		<Button
			variant="ghost"
			size="sm"
			busy={busy === "again"}
			disabled={Boolean(sendAgainBlocked) || Boolean(busy)}
			reason={sendAgainBlocked}
			onclick={() => void confirmedSend("again")}
		>
			Send again
		</Button>
	</div>
	<p class="error" role="alert">{error || " "}</p>

	<div class="test">
		<dl class="facts">
			<dt>Test</dt>
			<dd>To {status?.me.email || "you"} only</dd>
		</dl>
		<Button
			variant="outline"
			size="sm"
			busy={busy === "test"}
			disabled={Boolean(testBlocked) || Boolean(busy)}
			reason={testBlocked}
			onclick={() => void sendTest()}
		>
			{#snippet icon()}<Icon name="send" size={16} />{/snippet}
			Send me a test
		</Button>
		<p class="result {testResult?.tone || ''}" role="status">{testResult?.text || testBlocked || " "}</p>
	</div>
</Card>
<ConfirmDialog {confirm} />

<style>
	.now {
		display: grid;
		gap: var(--space-1);
		justify-items: start;
	}
	.detail {
		margin: 0;
		min-height: 1.4em;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.facts {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-1) var(--space-3);
		margin: var(--space-2) 0 0;
		font-size: var(--text-sm);
	}
	.facts dt {
		color: var(--muted-foreground);
	}
	.facts dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
	.error {
		margin: 0;
		min-height: 1.4em;
		color: var(--destructive);
		font-size: var(--text-sm);
	}
	.test {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		margin-top: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.test .facts {
		margin: 0;
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
