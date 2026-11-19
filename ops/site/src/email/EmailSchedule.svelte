<script lang="ts">
	/**
	 * The monthly email's schedule, inside its editor (MonthlyEmailEditor):
	 * the on/off switch, automatic or approve first, which weekday of the
	 * month and the time (London), and who's told. Everyone sees it; admins
	 * change it. Save is the editor's (`save()`); `dirty`, `saving` and
	 * `blocked` tell the editor's bar where it stands.
	 */
	import { ConfirmDialog, Confirm, Field, FormSection, NativeSelect, Segmented, Switch, TextField, TimeField } from "../ui";
	import { saveWeeklyEmailSettings, type WeeklyEmailSettings, type WeeklyEmailStatus } from "./email-api";
	import { DAY_OPTIONS, MODE_OPTIONS, settingsBlockedReason, settingsLine } from "./email-view";

	let {
		status,
		onsaved,
		dirty = $bindable(false),
		saving = $bindable(false),
		blocked = $bindable(""),
	}: {
		status: WeeklyEmailStatus | null;
		onsaved: (settings: WeeklyEmailSettings) => void;
		dirty?: boolean;
		saving?: boolean;
		/** Why it can't be changed here (not an admin, preview only), or "". */
		blocked?: string;
	} = $props();

	const confirm = new Confirm();
	$effect(() => {
		blocked = settingsBlockedReason(status);
	});
	const locked = $derived(Boolean(blocked));

	let sending = $state(false);
	let mode = $state("auto");
	let day = $state("tue");
	let time = $state("11:00");
	let notify = $state("");
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
	$effect(() => {
		dirty =
			Boolean(status) &&
			JSON.stringify({ ...draft, notify: draft.notify.join(",").toLowerCase() }) !==
				JSON.stringify({ ...status!.settings, notify: status!.settings.notify.join(",") });
	});
	const modeItems = $derived(MODE_OPTIONS.map((item) => ({ ...item, disabled: locked })));

	async function store() {
		const saved = await saveWeeklyEmailSettings(draft);
		error = "";
		onsaved(saved.settings);
	}

	export async function save() {
		if (!status || !dirty || locked) return;
		// Switching it on is the step that lets email reach real people: ask first.
		if (draft.sending && !status.settings.sending) {
			await confirm.run(
				{
					title: "Switch the monthly email on?",
					message: status.access.audience
						? `${settingsLine(draft).replace(/^On · /, "")} · to the mailing list`
						: "Saved, but only production ops sends to the mailing list.",
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

<FormSection title="Schedule" description={status ? settingsLine(status.settings) : "Loading…"}>
	<Field class="span-12" label="Monthly what's on" hint="Off: the list gets nothing. Tests still work.">
		<Switch bind:checked={sending} disabled={locked} label={sending ? "On" : "Off"} />
	</Field>
	<Field class="span-12" label="How" hint="Approve first: waits for an admin to press Approve and send.">
		<Segmented bind:value={mode} items={modeItems} tone="soft" size="sm" ariaLabel="How it's sent" />
	</Field>
	<Field class="span-6" label="Goes on the first" hint="Of each month">
		<NativeSelect bind:value={day} options={DAY_OPTIONS} disabled={locked} />
	</Field>
	<Field class="span-6" label="Time" hint="London">
		<TimeField bind:value={time} disabled={locked} placeholder="e.g. 11am" suggest="11:00" />
	</Field>
	<Field class="span-12" label="Alert" hint="When one waits for approval or fails. Empty: the admins.">
		<TextField bind:value={notify} disabled={locked} placeholder="name@example.com, …" />
	</Field>
	<p class="note span-12" role="status">{error || (locked && status ? blocked : " ")}</p>
</FormSection>
<ConfirmDialog {confirm} />

<style>
	.note {
		margin: 0;
		min-height: 1.4em;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}
</style>
