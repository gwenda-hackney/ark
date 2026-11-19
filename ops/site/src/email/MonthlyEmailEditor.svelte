<script lang="ts">
	/**
	 * The monthly what's on (#240), opened from its card like any email: the
	 * editor's card (EditorShell) over the Emails page, in two parts. This
	 * month: the email as it would go now, built from the website, beside
	 * where it stands and its buttons (Approve and send, a test to yourself).
	 * Schedule: its settings, saved with the bar's Save.
	 */
	import { untrack } from "svelte";
	import { navigate } from "../app/nav";
	import { Badge, EditorShell, Segmented } from "../ui";
	import type { AuthMe } from "../app/api";
	import { getWeeklyEmailPreview, type WeeklyEmailPreview, type WeeklyEmailStatus } from "./email-api";
	import EmailPreview from "./EmailPreview.svelte";
	import EmailSchedule from "./EmailSchedule.svelte";
	import EmailStatus from "./EmailStatus.svelte";
	import { contentsLine, nextLine, shortDay, statusLine } from "./email-view";

	let {
		open,
		me,
		status,
		onstatus,
		onreload,
	}: {
		open: boolean;
		me: AuthMe;
		status: WeeklyEmailStatus | null;
		onstatus: (status: WeeklyEmailStatus) => void;
		/** Ask the page for the status again (after the schedule is saved). */
		onreload: () => void;
	} = $props();

	const PARTS = [
		{ id: "month", label: "This month" },
		{ id: "schedule", label: "Schedule" },
	];
	let part = $state("month");

	let email = $state<WeeklyEmailPreview | null>(null);
	let problem = $state("");
	let loading = $state(false);
	async function loadPreview() {
		loading = true;
		try {
			const data = await getWeeklyEmailPreview();
			email = data.email;
			problem = data.problem;
		} catch (err) {
			problem = err instanceof Error ? err.message : "Could not load the email.";
		} finally {
			loading = false;
		}
	}
	// Built the first time it opens.
	$effect(() => {
		if (open && untrack(() => !email && !problem && !loading)) void loadPreview();
	});

	let schedule = $state<ReturnType<typeof EmailSchedule> | null>(null);
	let dirty = $state(false);
	let saving = $state(false);
	let blocked = $state("");

	const badge = $derived(status ? statusLine(status) : null);
	const subtitle = $derived(status ? `Next: ${nextLine(status)}` : "Built from What's on, once a month.");

	function close() {
		navigate("/email");
	}
</script>

{#snippet kicker()}
	<p class="eyebrow">Email</p>
	{#if badge}<Badge tone={badge.tone} label={badge.label} />{/if}
{/snippet}

{#snippet tabs()}
	<Segmented bind:value={part} items={PARTS} ariaLabel="This month or its schedule" />
{/snippet}

<EditorShell
	{open}
	backLabel="Emails"
	onclose={close}
	{dirty}
	busy={saving}
	{kicker}
	heading="Monthly what's on"
	{subtitle}
	{tabs}
	actions={{
		saveLabel: "Save schedule",
		saving,
		disabled: part !== "schedule" || !dirty || saving || Boolean(blocked),
		dirty,
		onsave: () => void schedule?.save(),
	}}
>
	<div class="tab-body">
		<!-- Both parts stay mounted, so switching never loses unsaved schedule edits. -->
		<div class="layout" data-env={me.siteEnv} hidden={part !== "month"}>
				<EmailPreview
					{email}
					{problem}
					{loading}
					title="This month's email"
					subtitle={email
						? `${shortDay(email.today)} – ${shortDay(email.month.end)} · ${contentsLine(email)}`
						: problem
							? "Couldn't be built just now."
							: "Building it from the website…"}
					warning={email?.empty ? email.emptyReason : ""}
					note={`From the live website, as it would go now · links to ${email?.origin || "the website"} · Gmail's fonts (Apple Mail shows the website's)`}
				/>
				<EmailStatus {status} hasEmail={Boolean(email)} onchange={(next) => onstatus({ ...next, me: status?.me ?? next.me })} />
		</div>
		<div class="narrow" hidden={part !== "schedule"}>
				<EmailSchedule
					bind:this={schedule}
					bind:dirty
					bind:saving
					bind:blocked
					{status}
					onsaved={(settings) => {
						if (status) onstatus({ ...status, settings });
						onreload();
					}}
				/>
		</div>
	</div>
</EditorShell>

<style>
	.tab-body {
		padding: 1rem var(--card-pad-lg) var(--card-pad-lg);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
		gap: var(--space-4);
		align-items: start;
	}
	.narrow {
		max-width: 40rem;
	}
	[hidden] {
		display: none !important;
	}
	@media (max-width: 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
