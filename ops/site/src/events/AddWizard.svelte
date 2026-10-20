<script lang="ts">
	/**
	 * Add something to What's on, one question at a time (#245). Each answer
	 * fills the editor's form; Next waits until the step is answered, so a
	 * repeating series can't be saved without its first night. Finishing
	 * saves through the editor, and puts it on the website unless it's a draft.
	 */
	import { tick } from "svelte";
	import { Icon } from "../app/shell";
	import { Button, ComboBox, DateField, Dialog, Field, NativeSelect, TextArea, TextField, TimeField } from "../ui";
	import MethodEditor from "../menu/MethodEditor.svelte";
	import HeroImagePanel from "./HeroImagePanel.svelte";
	import NightScheduleFields from "./tabs/NightScheduleFields.svelte";
	import type { EventEditor, NewEventKind } from "./event-editor.svelte";
	import { formatClock, formatDate, WEEKDAY_LABELS } from "./event-labels";
	import { WEEKDAYS } from "./event-recurrence.js";
	import { descriptionReadout } from "./description-links";
	import {
		HOW_OFTEN,
		STEP_TITLES,
		howOftenId,
		stepErrors,
		stepOfField,
		whenSentence,
		wizardSteps,
		wizardWhenErrors,
		type WizardStep,
	} from "./add-wizard";

	let { editor, onclose }: { editor: EventEditor; onclose: () => void } = $props();

	const form = $derived(editor.form);
	const kind = $derived(editor.newKind);
	const steps = $derived(wizardSteps(kind));
	let index = $state(0);
	// Add night on a series picks the series as the page opens: start at the
	// date. Not when someone picks one here (`touched`).
	let touched = false;
	$effect(() => {
		if (!touched && index === 0 && editor.creatingNight && editor.attachSeriesId) index = 1;
	});
	const step = $derived(steps[Math.min(index, steps.length - 1)]);
	const last = $derived(index >= steps.length - 1);
	const busy = $derived(editor.busy || editor.putting);
	// Problems show once Next was pressed on a step, and follow what's typed.
	let showProblems = $state(false);
	let noEnd = $state(true);

	const KINDS: { id: NewEventKind; title: string; blurb: string; icon: string }[] = [
		{ id: "once", title: "A one-off event", blurb: "One date, like a gig or a party.", icon: "star" },
		{ id: "series", title: "Something that repeats", blurb: "Like a weekly quiz or Happy Hour.", icon: "refresh" },
		{ id: "night", title: "A special night in a series we already run", blurb: "One date of a series, say with a guest.", icon: "events" },
	];

	function problems(at: WizardStep): Record<string, string> {
		return stepErrors({ ...editor.validate(), ...(at === "when" ? wizardWhenErrors(form, kind) : {}) }, at);
	}


	async function focusFirst() {
		await tick();
		const el = document.querySelector<HTMLElement>(".wizard-body input:not(.sr-only), .wizard-body textarea, .wizard-body [contenteditable='true']");
		el?.focus({ preventScroll: true });
	}

	function go(to: number) {
		index = Math.max(0, Math.min(to, steps.length - 1));
		showProblems = false;
		void focusFirst();
	}

	function next() {
		if (Object.keys(problems(step)).length) {
			showProblems = true;
			return;
		}
		go(index + 1);
	}

	// A series here always repeats (it's the preselected answer, so don't wait
	// for a tap); weekly is the usual one.
	$effect(() => {
		if (kind === "series" && (form.repeatUnit === "none" || form.repeatUnit === "once")) {
			form.repeatUnit = "week";
			form.repeatEvery = "1";
		}
	});

	function choose(id: NewEventKind) {
		touched = true;
		editor.setNewKind(id);
	}

	function setHowOften(id: string) {
		const option = HOW_OFTEN.find((row) => row.id === id);
		if (!option) return;
		form.repeatUnit = option.unit;
		form.repeatEvery = String(option.every);
	}

	function setNoEnd(value: boolean) {
		noEnd = value;
		if (value) form.endsOn = "";
	}

	function pickArtist(id: string) {
		const hit = editor.approvedArtists.find((row) => row.id === id);
		if (!hit) return;
		form.artist = hit.name;
		if (hit.link) form.pageUrl = hit.link;
	}

	async function finish(publish: boolean) {
		if (busy) return;
		// Anything still missing: back to the step that asks for it.
		for (const at of steps) {
			if (Object.keys(problems(at)).length) {
				go(steps.indexOf(at));
				showProblems = true;
				return;
			}
		}
		if (kind === "night") {
			// What's typed is the night's own; what's left empty follows the series.
			form.defaultsUnlocked = true;
			form.ownPhoto = Boolean(editor.pendingPhoto);
		}
		editor.publishAfterSave = publish;
		await editor.onSave(new Event("submit"));
	}

	const seriesTimes = $derived(
		editor.parentSeries
			? [formatClock(editor.parentSeries.startTime || ""), formatClock(editor.parentSeries.endTime || "")]
					.filter(Boolean)
					.join("–")
			: "",
	);
	const nextNights = $derived(kind === "series" ? editor.previewDates.slice(0, 4) : []);
	const slotsText = $derived(
		form.nightSchedule
			.filter((slot) => slot.label.trim())
			.map((slot) => [slot.label.trim(), [formatClock(slot.startTime), formatClock(slot.endTime)].filter(Boolean).join("–")].filter(Boolean).join(" "))
			.join(", "),
	);
	const kindTitle = $derived(KINDS.find((row) => row.id === kind)?.title || "");
	const checkRows = $derived(
		[
			{ label: "What", value: kind === "night" ? `${kindTitle}: ${editor.parentSeriesName}` : kindTitle, at: "kind" as WizardStep },
			{ label: "Name", value: form.name.trim(), at: "name" as WizardStep },
			{ label: "When", value: whenSentence(form, kind), at: "when" as WizardStep },
			{ label: "Running order", value: slotsText, at: "running" as WizardStep },
			{ label: "Guest", value: form.artist.trim(), at: (kind === "night" ? "guest" : "name") as WizardStep },
			{ label: "Guest link", value: form.pageUrl.trim(), at: (kind === "night" ? "guest" : "name") as WizardStep },
			{ label: "Offer", value: form.offer.trim(), at: (kind === "night" ? "guest" : "name") as WizardStep },
			{ label: "Card line", value: form.shortDescription.trim(), at: "about" as WizardStep },
			{ label: "Description", value: descriptionReadout(form.description).slice(0, 220), at: "about" as WizardStep },
			{ label: "Picture", value: editor.framingUrl ? "Added" : "None yet", at: "picture" as WizardStep },
			{ label: "Notes for the team", value: form.operationsNotes.trim(), at: "notes" as WizardStep },
		].filter((row) => steps.includes(row.at)),
	);
	const shown = $derived<Record<string, string>>(showProblems ? problems(step) : {});
</script>

{#snippet foot()}
	<div class="wizard-foot">
		<Button type="button" variant="outline" disabled={index === 0 || busy} onclick={() => go(index - 1)}>
			{#snippet icon()}<Icon name="chevron-left" size={16} />{/snippet}
			Back
		</Button>
		<div class="wizard-actions">
			<!-- Always there, so Next never moves; only the last step uses it. -->
			<Button type="button" variant="ghost" class={last ? "" : "reserve"} disabled={!last || busy} onclick={() => void finish(false)}>
				Save as draft
			</Button>
			{#if last}
				<Button type="button" busy={busy} disabled={busy} onclick={() => void finish(true)}>Save and put on website</Button>
			{:else}
				<Button type="button" disabled={busy} onclick={next}>Next</Button>
			{/if}
		</div>
	</div>
{/snippet}

<Dialog open sheet size="lg" title="Add to What's on" {onclose} footer={foot}>
<div class="wizard">
	<header class="wizard-head">
		<p class="wizard-count">Step {index + 1} of {steps.length}</p>
		<h1 class="wizard-title">{STEP_TITLES[step]}</h1>
		<div class="wizard-progress" aria-hidden="true">
			{#each steps as s, i (s)}
				<span class:done={i < index} class:here={i === index}></span>
			{/each}
		</div>
	</header>

	<div class="wizard-body">
		{#if step === "kind"}
			<div class="kinds" role="radiogroup" aria-label="What are you adding?">
				{#each KINDS as option (option.id)}
					<label class="kind" class:on={kind === option.id}>
						<input
							class="sr-only"
							type="radio"
							name="wizard-kind"
							value={option.id}
							checked={kind === option.id}
							onchange={() => choose(option.id)}
						/>
						<span class="kind-icon" aria-hidden="true"><Icon name={option.icon} size={18} /></span>
						<span class="kind-text">
							<span class="kind-title">{option.title}</span>
							<span class="kind-blurb">{option.blurb}</span>
						</span>
					</label>
				{/each}
			</div>
			{#if kind === "night"}
				<Field label="Which series?" for="event-series" required reserve error={shown["event-series"]}>
					<NativeSelect
						id="event-series"
						onchange={() => (touched = true)}
						bind:value={editor.attachSeriesId}
						options={[{ value: "", label: "Choose a series…" }, ...editor.seriesOptions]}
					/>
				</Field>
			{/if}
		{:else if step === "name"}
			<Field label="Name" for="event-name" required reserve error={shown["event-name"]}>
				<TextField id="event-name" bind:value={form.name} placeholder={kind === "series" ? "Happy Hour" : "Halloween party"} />
			</Field>
			<Field label="Guest or artist" for="event-artist" optional>
				<ComboBox
					id="event-artist"
					bind:value={form.artist}
					placeholder="Artist, DJ or collaborator"
					emptyText="No approved artists yet."
					options={editor.approvedArtists.map((row) => ({ value: row.id, label: row.name }))}
					onpick={(option) => pickArtist(option.value)}
				/>
			</Field>
			<div class="pair">
				<Field label="Guest link" for="event-page-url" optional>
					<TextField id="event-page-url" type="text" inputmode="url" autocomplete="off" spellcheck="false" bind:value={form.pageUrl} placeholder="instagram.com/… or @handle" />
				</Field>
				<Field label="Offer" for="event-offer" optional>
					<TextField id="event-offer" bind:value={form.offer} placeholder="£10 Negroni" />
				</Field>
			</div>
		{:else if step === "when"}
			{#if kind === "series"}
				<Field label="How often?" for="wizard-how-often" required>
					<div class="choices" id="wizard-how-often" role="radiogroup" aria-label="How often?">
						{#each HOW_OFTEN as option (option.id)}
							<button
								type="button"
								class="choice"
								class:on={howOftenId(form.repeatUnit, form.repeatEvery) === option.id}
								aria-pressed={howOftenId(form.repeatUnit, form.repeatEvery) === option.id}
								onclick={() => setHowOften(option.id)}>{option.label}</button
							>
						{/each}
					</div>
				</Field>
				{#if form.repeatUnit === "week"}
					<Field label="Which days?" for="wizard-days" required reserve error={shown["event-weekdays"]}>
						<div class="days" id="wizard-days">
							{#each WEEKDAYS as day (day)}
								<button
									type="button"
									class="choice"
									class:on={form.weekdays.includes(day)}
									aria-pressed={form.weekdays.includes(day)}
									onclick={() => form.toggleWeekday(day)}>{WEEKDAY_LABELS[day]}</button
								>
							{/each}
						</div>
					</Field>
				{/if}
				<div class="pair">
					<Field label="Starting from" for="event-starts" required reserve error={shown["event-starts"]}>
						<DateField id="event-starts" bind:value={form.startsOn} />
					</Field>
					<Field label="Until" for="wizard-until" required reserve error={shown["event-ends"]}>
						<div class="choices" id="wizard-until">
							<button type="button" class="choice" class:on={noEnd} aria-pressed={noEnd} onclick={() => setNoEnd(true)}>
								No end date
							</button>
							<button type="button" class="choice" class:on={!noEnd} aria-pressed={!noEnd} onclick={() => setNoEnd(false)}>
								A date
							</button>
						</div>
						{#if !noEnd}
							<DateField id="event-ends" bind:value={form.endsOn} min={form.startsOn} />
						{/if}
					</Field>
				</div>
			{:else}
				<Field label="Date" for="event-date" required reserve error={shown["event-date"]}>
					<DateField id="event-date" bind:value={form.startsOn} />
				</Field>
			{/if}
			<div class="pair">
				<Field label="Starts" for="event-start-time" required={kind !== "night"} optional={kind === "night"} reserve error={shown["event-start-time"]}>
					<TimeField id="event-start-time" bind:value={form.startTime} />
				</Field>
				<Field label="Ends" for="event-end-time" optional>
					<TimeField id="event-end-time" bind:value={form.endTime} />
				</Field>
			</div>
			{#if kind === "night" && seriesTimes}
				<p class="hint">Leave the times empty to use the series' times ({seriesTimes}).</p>
			{/if}
			{#if whenSentence(form, kind)}
				<p class="sentence">{whenSentence(form, kind)}</p>
			{/if}
			{#if nextNights.length}
				<p class="hint">Next: {nextNights.map(formatDate).join(", ")}…</p>
			{/if}
		{:else if step === "running"}
			<p class="hint">
				Sets, acts or rounds, with their times. Nothing like that? Press Next.
				{kind === "night" ? "Left empty, the night follows its series." : ""}
			</p>
			<NightScheduleFields {form} {busy} />
		{:else if step === "guest"}
			<Field label="Guest or artist" for="event-artist" optional>
				<ComboBox
					id="event-artist"
					bind:value={form.artist}
					placeholder="Who's playing or hosting?"
					emptyText="No approved artists yet."
					options={editor.approvedArtists.map((row) => ({ value: row.id, label: row.name }))}
					onpick={(option) => pickArtist(option.value)}
				/>
			</Field>
			<div class="pair">
				<Field label="Guest link" for="event-page-url" optional>
					<TextField id="event-page-url" type="text" inputmode="url" autocomplete="off" spellcheck="false" bind:value={form.pageUrl} placeholder="instagram.com/… or @handle" />
				</Field>
				<Field label="Offer" for="event-offer" optional>
					<TextField id="event-offer" bind:value={form.offer} placeholder="£10 Negroni" />
				</Field>
			</div>
			<Field label="Anything special about this night?" for="event-description" optional>
				<MethodEditor
					id="event-description"
					value={form.description}
					label="This night's description"
					kind="description"
					placeholder="Leave empty to use the series' description."
					onChange={(next) => (form.description = next)}
				/>
			</Field>
		{:else if step === "about"}
			<Field label="One line for the listing" for="event-short-description" optional>
				<TextArea id="event-short-description" bind:value={form.shortDescription} rows={2} placeholder="20% off all cocktails, Wed to Sat." />
			</Field>
			<Field label="Description" for="event-description" required reserve error={shown["event-description"]}>
				<MethodEditor
					id="event-description"
					value={form.description}
					label="Event description"
					kind="description"
					placeholder="What's happening, who's it for, what to expect…"
					onChange={(next) => (form.description = next)}
				/>
			</Field>
		{:else if step === "picture"}
			<HeroImagePanel
				heading=""
				sourceUrl={editor.framingUrl}
				crops={form.heroCrops}
				disabled={busy}
				onchangecrops={(crops) => (form.heroCrops = crops)}
				onpickfile={(file) => editor.acceptPhotoFile(file)}
				onclear={() => editor.clearPendingPhoto()}
			/>
			<p class="hint">
				{kind === "night" ? "No picture? It uses the series' one." : "A flyer or a photo. No picture yet? Press Next."}
			</p>
		{:else if step === "notes"}
			<Field label="Notes for the team" for="event-ops-notes" optional>
				<TextArea id="event-ops-notes" bind:value={form.operationsNotes} rows={5} placeholder="Set-up, kit, who to call on the night…" />
			</Field>
			<p class="hint">Only the team sees these. They're not on the website.</p>
		{:else if step === "check"}
			<dl class="check">
				{#each checkRows as row (row.label)}
					<div class="check-row">
						<dt>{row.label}</dt>
						<dd class:empty={!row.value}>{row.value || "—"}</dd>
						<button type="button" class="link" disabled={busy} onclick={() => go(steps.indexOf(row.at))}>Change</button>
					</div>
				{/each}
			</dl>
			<p class="error" role="alert">{editor.error}</p>
		{/if}
	</div>

</div>
</Dialog>

<style>
	.wizard {
		display: grid;
		gap: var(--space-5);
		align-content: start;
	}

	.wizard-count {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.wizard-title {
		margin: var(--space-1) 0 var(--space-3);
		font-size: var(--text-xl, 1.25rem);
		font-weight: 600;
	}

	.wizard-progress {
		display: grid;
		grid-auto-flow: column;
		gap: var(--space-1);
	}

	.wizard-progress span {
		height: 4px;
		border-radius: 2px;
		background: var(--surface-3);
	}

	.wizard-progress span.done,
	.wizard-progress span.here {
		background: var(--primary);
	}

	.wizard-body {
		display: grid;
		align-content: start;
		gap: var(--space-4);
	}

	.kinds {
		display: grid;
		gap: var(--space-3);
	}

	.kind {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		cursor: pointer;
	}

	.kind:hover {
		background: var(--surface-3);
	}

	.kind.on {
		border-color: var(--primary);
		background: var(--primary-wash);
	}

	.kind:has(input:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.kind-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: var(--muted-foreground);
	}

	.kind.on .kind-icon {
		color: var(--primary);
	}

	.kind-text {
		display: grid;
		gap: 0.125rem;
	}

	.kind-title {
		font-weight: 600;
		color: var(--foreground);
	}

	.kind-blurb {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.choices,
	.days {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
	}

	.choice {
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--foreground);
		font: inherit;
		cursor: pointer;
	}

	.choice.on {
		border-color: var(--primary);
		background: var(--primary-wash);
		font-weight: 600;
	}

	.choice:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		gap: var(--space-4);
	}

	.pair > :global(*) {
		display: grid;
		gap: var(--space-2);
	}

	.sentence {
		margin: 0;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		font-weight: 600;
	}

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.error {
		margin: 0;
		min-height: 1lh;
		color: var(--destructive);
		font-size: var(--text-sm);
	}

	.check {
		display: grid;
		margin: 0;
		border-top: 1px solid var(--border);
	}

	.check-row {
		display: grid;
		grid-template-columns: 9rem 1fr auto;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}

	.check-row dt {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.check-row dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.check-row dd.empty {
		color: var(--muted-foreground);
	}

	.link {
		border: 0;
		background: none;
		color: var(--primary);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.wizard-foot {
		display: flex;
		flex: 1;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.wizard-actions {
		display: flex;
		gap: var(--space-2);
	}

	.wizard-actions :global(.reserve) {
		visibility: hidden;
	}

	@media (max-width: 30rem) {
		.check-row {
			grid-template-columns: 1fr auto;
		}

		.check-row dt {
			grid-column: 1 / -1;
		}
	}
</style>
