<script lang="ts">
	/**
	 * Schedule and mode: the on/off switch, automatic or approve first, the
	 * day and time (London), and who's told. Everyone sees it; admins change it.
	 */
	import { Card, Button, ConfirmDialog, Confirm, Field, NativeSelect, Segmented, Switch, TextField, TimeField } from "../ui";
	import { saveWeeklyEmailSettings, type WeeklyEmailSettings, type WeeklyEmailStatus } from "./email-api";
	import { DAY_OPTIONS, MODE_OPTIONS, settingsBlockedReason, settingsLine } from "./email-view";

	let { status, onsaved }: { status: WeeklyEmailStatus | null; onsaved: (settings: WeeklyEmailSettings) => void } = $props();

	const confirm = new Confirm();
	const blocked = $derived(settingsBlockedReason(status));
	const locked = $derived(Boolean(blocked));

	let sending = $state(false);
	let mode = $state("auto");
	let day = $state("tue");
	let time = $state("11:00");
	let notify = $state("");
	let saving = $state(false);
	let error = $state("");
	let loadedFrom = "";

	// Take the saved settings when they arrive or change; never over unsaved edits of the same ones.
	$effect(() => {
		const saved = status?.settings;
		const key = saved ? JSON.stringify(saved) : "";
		if (!saved || key === loadedFrom) return;
		loadedFrom = key;
		sending = saved.sending;
		mode = saved.mode;
		day = saved.day;
		time = saved.time;
		notify = saved.notify.join(", ");
	});

	const draft = $derived<WeeklyEmailSettings>({
		sending,
		mode: mode === "approve" ? "approve" : "auto",
		day: day as WeeklyEmailSettings["day"],
		time,
		notify: notify.split(/[\s,;]+/).filter(Boolean),
	});
	const dirty = $derived(
		Boolean(status) && JSON.stringify({ ...draft, notify: draft.notify.join(",").toLowerCase() }) !==
			JSON.stringify({ ...status!.settings, notify: status!.settings.notify.join(",") }),
	);
	const modeItems = $derived(MODE_OPTIONS.map((item) => ({ ...item, disabled: locked })));

	async function store() {
		const saved = await saveWeeklyEmailSettings(draft);
		error = "";
		onsaved(saved.settings);
	}

	async function save() {
		if (!status) return;
		// Switching it on is the step that lets email reach real people: ask first.
		if (draft.sending && !status.settings.sending) {
			await confirm.run(
				{
					title: "Switch the weekly email on?",
					message: status.access.audience
						? settingsLine(draft).replace(/^On\. /, "")
						: "It's saved, but nothing is sent from here: only production ops sends to the mailing list.",
					action: "Switch on",
					tone: "primary",
				},
				store,
			);
			return;
		}
		saving = true;
		try {
			await store();
		} catch (err) {
			error = err instanceof Error ? err.message : "Couldn't save.";
		} finally {
			saving = false;
		}
	}
</script>

<Card title="Schedule" subtitle={status ? settingsLine(status.settings) : "Loading…"}>
	<div class="form">
		<Field label="Send the weekly email" hint="Off: nothing goes to the mailing list. Tests to yourself still work.">
			<Switch bind:checked={sending} disabled={locked} label={sending ? "On" : "Off"} />
		</Field>
		<Field
			label="How"
			hint="Automatically: it goes by itself at its time. Approve first: a draft waits until an admin presses Approve and send."
		>
			<Segmented bind:value={mode} items={modeItems} tone="soft" size="sm" ariaLabel="How it's sent" />
		</Field>
		<div class="pair">
			<Field label="Day">
				<NativeSelect bind:value={day} options={DAY_OPTIONS} disabled={locked} />
			</Field>
			<Field label="Time" hint="London time.">
				<TimeField bind:value={time} disabled={locked} placeholder="e.g. 11am" suggest="11:00" />
			</Field>
		</div>
		<Field label="Who to tell" hint="When one waits for approval or doesn't send. Leave empty for the admins.">
			<TextField bind:value={notify} disabled={locked} placeholder="name@example.com, …" />
		</Field>
		<div class="actions">
			<Button size="sm" busy={saving} disabled={locked || !dirty || saving} reason={blocked || (dirty ? "" : "Nothing to save.")} onclick={() => void save()}>
				Save
			</Button>
			<p class="note" role="status">{error || (locked && status ? blocked : " ")}</p>
		</div>
	</div>
</Card>
<ConfirmDialog {confirm} />

<style>
	.form {
		display: grid;
		gap: var(--space-3);
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.note {
		margin: 0;
		min-height: 1.4em;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
