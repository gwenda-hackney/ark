<script lang="ts">
	/**
	 * Status and history: where this week's email is, when the next is due,
	 * the last few, and the three things an admin can do. The buttons are
	 * always there; one that can't be pressed says why.
	 */
	import { Icon } from "../app/shell";
	import { Badge, Button, Card, Confirm, ConfirmDialog } from "../ui";
	import {
		approveWeeklyEmail,
		getWeeklyEmailAudience,
		prepareWeeklyEmail,
		sendWeeklyEmailAgain,
		type WeeklyEmailStatus,
	} from "./email-api";
	import {
		approveBlockedReason,
		audienceLine,
		nextLine,
		runLine,
		sendAgainBlockedReason,
		shortDay,
		statusLine,
		tryAgainBlockedReason,
	} from "./email-view";

	let { status, onchange }: { status: WeeklyEmailStatus | null; onchange: (status: WeeklyEmailStatus) => void } = $props();

	const confirm = new Confirm();
	let busy = $state("");
	let error = $state("");

	const now = $derived(status ? statusLine(status) : null);
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
			const to = audienceLine(audience.memberCount);
			const after = status.current?.id ?? 0;
			await confirm.run(
				kind === "approve"
					? {
							title: `Send this week's email to ${to}?`,
							message: "It goes to everyone on the mailing list now, as the preview shows it. It can't be taken back.",
							action: "Approve and send",
							tone: "primary",
						}
					: {
							title: `Send it again to ${to}?`,
							message: "This week's email has already gone. Everyone on the mailing list gets a second one. It can't be taken back.",
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

<Card title="Status">
	<div class="now">
		<Badge tone={now?.tone || "neutral"} label={now?.label || "Loading…"} />
		<p class="detail">{now?.detail || " "}</p>
		<p class="muted">{status ? nextLine(status) : " "}</p>
	</div>

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
	<p class="hint">
		Try again gets this week's email ready and leaves it waiting for Approve and send.
	</p>
	<p class="error" role="alert">{error || " "}</p>

	<h3>Last few</h3>
	{#if status?.historyProblem}
		<p class="error">{status.historyProblem}</p>
	{:else if status && !status.history.length}
		<p class="muted">None yet.</p>
	{:else if status}
		<ul class="history">
			{#each status.history as run (run.id)}
				{@const line = runLine(run)}
				<li>
					<div class="row">
						<span class="week">Week of {shortDay(run.weekStart)}</span>
						<Badge tone={line.tone} label={line.label} />
					</div>
					{#if run.subject}<p class="subject">{run.subject}</p>{/if}
					{#if line.detail}<p class="muted">{line.detail}</p>{/if}
					{#if run.campaignUrl}
						<a class="link" href={run.campaignUrl} target="_blank" rel="noreferrer">
							See it in Mailchimp <Icon name="external-link" size={12} />
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">Loading…</p>
	{/if}
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
	.muted,
	.hint {
		margin: 0;
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.hint {
		font-size: var(--text-xs);
		margin-top: var(--space-2);
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
	h3 {
		margin: var(--space-2) 0 var(--space-2);
		font-size: var(--text-sm);
	}
	.history {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.history li {
		display: grid;
		gap: 0.15rem;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.week {
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.subject {
		margin: 0;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--text-sm);
		color: var(--primary);
	}
</style>
