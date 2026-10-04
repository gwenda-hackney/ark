<script lang="ts">
	/**
	 * The event editor's fields, a tab's worth at a time. Details is what it
	 * is and when each night runs, in the website's words, and the photo;
	 * Schedule is a series' pattern and night schedule; Ops is the team's tasks
	 * and notes. A night or a special event has one date, which sits with its
	 * times under the name. A new form
	 * is every part on one page, starting with the chooser. A night shows each
	 * value it takes from its series as "From series", with Override beside it.
	 */
	import { tick } from "svelte";
	import { Icon } from "../../app/shell";
	import {
		ComboBox,
		DateField,
		Field,
		FormSection,
		NativeSelect,
		PhotoActions,
		TextArea,
		TextField,
		TimeField,
	} from "../../ui";
	import type { FormErrors } from "../../ui/form-errors.svelte";
	import MethodEditor from "../../menu/MethodEditor.svelte";
	import type { ApprovedArtist, OpsEvent } from "../../app/api";
	import { itemSlug } from "../../app/nav";
	import HeroImagePanel from "../HeroImagePanel.svelte";
	import InheritedValue from "../InheritedValue.svelte";
	import RepeatFields from "./RepeatFields.svelte";
	import NightScheduleFields from "./NightScheduleFields.svelte";
	import { hasMeaningfulFraming, type HeroFraming } from "../hero-crops";
	import { formatDate, socialTaskNote } from "../event-labels";
	import {
		lockedReadout,
		seriesText,
		type EventForm,
		type SeriesTextKey,
	} from "../event-form.svelte";
	import type { NewEventKind } from "../event-editor.svelte";

	let {
		part,
		form,
		errors,
		current,
		parentSeries,
		eventId,
		occurrenceDate,
		busy,
		isNew,
		newKind,
		creatingNight,
		creatingOnce,
		editingOnce,
		editingOccurrence,
		attachSeriesId = $bindable(),
		seriesOptions,
		approvedArtists,
		webAddressChanged,
		framingUrl,
		previewDates,
		onkind,
		onoverride,
		onuseseries,
		onoverridephoto,
		onuseseriesphoto,
		onpickphoto,
		onclearphoto,
	}: {
		/** The tab's fields, or "all" for a new form. */
		part: "all" | "details" | "schedule" | "ops";
		form: EventForm;
		/** Problems from the last Save, by field id. */
		errors: FormErrors;
		/** The saved event (null while new). */
		current: OpsEvent | null;
		/** The series a night takes its values from (null for a series or special event). */
		parentSeries: OpsEvent | null;
		eventId: string;
		occurrenceDate: string;
		busy: boolean;
		isNew: boolean;
		/** What a new form makes, from the chooser. */
		newKind: NewEventKind;
		creatingNight: boolean;
		creatingOnce: boolean;
		editingOnce: boolean;
		/** One night of a series: fields follow the series until overridden. */
		editingOccurrence: boolean;
		/** The series a new night is added to ("" for a new series or special event). */
		attachSeriesId: string;
		seriesOptions: { value: string; label: string }[];
		/** Approved play applicants, suggested in Guest/collaboration. */
		approvedArtists: ApprovedArtist[];
		webAddressChanged: boolean;
		/** The photo this editor owns (series main, the night's own, or one picked before the first save). */
		framingUrl: string;
		/** Upcoming nights from the pattern as typed. */
		previewDates: string[];
		onkind: (kind: NewEventKind) => void;
		onoverride: (key: SeriesTextKey) => void;
		onuseseries: (key: SeriesTextKey) => void;
		onoverridephoto: () => void;
		onuseseriesphoto: () => void;
		onpickphoto: (file: File | undefined | null) => void;
		onclearphoto: () => void;
	} = $props();

	/** A night: its values come from a series unless it overrides them. */
	const inherits = $derived(editingOccurrence || creatingNight);
	const isSeries = $derived(!inherits && !creatingOnce && !editingOnce);
	const isOnce = $derived(creatingOnce || editingOnce);
	const follows = (key: SeriesTextKey) => inherits && !form.isOverridden(key);

	/** The sections this part shows. A single date's When (and its night schedule) is on Details. */
	const show = $derived.by(() => {
		const all = part === "all";
		const details = all || part === "details";
		const schedule = all || (isSeries ? part === "schedule" : part === "details");
		return {
			what: details,
			photo: details,
			when: isSeries && schedule,
			slots: schedule && !editingOccurrence,
			slotsBeside: part === "schedule" && isSeries,
			ops: all || part === "ops",
		};
	});

	const FIELD_IDS: Record<SeriesTextKey, string> = {
		name: "event-name",
		artist: "event-artist",
		pageUrl: "event-page-url",
		startTime: "event-start-time",
		endTime: "event-end-time",
		offer: "event-offer",
		shortDescription: "event-short-description",
		description: "event-description",
		operationsNotes: "event-operations-notes",
	};

	const KINDS: { id: NewEventKind; title: string; blurb: string; icon: string }[] = [
		{
			id: "series",
			title: "New series",
			blurb: "A night that comes round again, like a weekly residency.",
			icon: "refresh",
		},
		{
			id: "night",
			title: "Night for a series",
			blurb: "One date for a series you already run. It takes the series' details.",
			icon: "events",
		},
		{
			id: "once",
			title: "Special event",
			blurb: "A one-off on a single date, with its own page.",
			icon: "star",
		},
	];

	/** What a following field shows: the series' value, or why there is none. */
	function readout(key: SeriesTextKey): string {
		if (!parentSeries) return "Pick a series first";
		const raw = lockedReadout(parentSeries, key);
		return key === "description" ? plainText(raw) : raw;
	}

	function plainText(html: string): string {
		return html
			.replace(/<\/(p|li|h\d)>/gi, "\n")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<[^>]*>/g, "")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	async function override(key: SeriesTextKey) {
		onoverride(key);
		await tick();
		(document.getElementById(FIELD_IDS[key]) as HTMLElement | null)?.focus();
	}

	/** Picked from the Guest/collaboration list: their name, and their Instagram or website. */
	function pickApprovedArtist(id: string) {
		const hit = approvedArtists.find((row) => row.id === id);
		if (!hit) return;
		form.artist = hit.name;
		if (!hit.link) return;
		if (inherits && !form.isOverridden("pageUrl")) onoverride("pageUrl");
		form.pageUrl = hit.link;
	}

	function onPhotoFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (file) onpickphoto(file);
	}

	function onCropsChange(next: HeroFraming | null) {
		form.heroCrops = next && hasMeaningfulFraming(next) ? next : null;
	}

	const seriesPhotoUrl = $derived(parentSeries?.mainImage?.url || "");
	/** A night shows the series photo until it gets one of its own. */
	const photoFollows = $derived(inherits && !form.ownPhoto && !framingUrl);
	const nextNights = $derived(previewDates.slice(0, 4));
	const taskNote = $derived(socialTaskNote(current, occurrenceDate));
</script>

{#snippet inheritAction(key: SeriesTextKey)}
	{#if inherits}
		{#if form.isOverridden(key)}
			<button type="button" class="field-link" disabled={busy} onclick={() => onuseseries(key)}>
				Use series value
			</button>
		{:else}
			<button
				type="button"
				class="field-link"
				disabled={busy || !parentSeries}
				onclick={() => void override(key)}
			>
				Override
			</button>
		{/if}
	{/if}
{/snippet}

<div class="board">
	{#if isNew}
		<FormSection title="What are you adding?" class="chooser">
			<div class="kinds" role="radiogroup" aria-label="What are you adding?">
				{#each KINDS as kind (kind.id)}
					<label class="kind" class:on={newKind === kind.id}>
						<input
							class="sr-only"
							type="radio"
							name="event-kind"
							value={kind.id}
							checked={newKind === kind.id}
							onchange={() => onkind(kind.id)}
						/>
						<span class="kind-icon" aria-hidden="true"><Icon name={kind.icon} size={18} /></span>
						<span class="kind-text">
							<span class="kind-title">{kind.title}</span>
							<span class="kind-blurb">{kind.blurb}</span>
						</span>
					</label>
				{/each}
			</div>
			{#if newKind === "night"}
				<Field class="span-4" label="Series" for="event-series" required error={errors.get("event-series")}>
					<NativeSelect
						id="event-series"
						size="sm"
						bind:value={attachSeriesId}
						options={[{ value: "", label: "Choose a series…" }, ...seriesOptions]}
					/>
				</Field>
			{/if}
		</FormSection>
	{/if}

	<div class="cols" class:after-chooser={isNew} class:with-photo={show.photo} class:split={show.slotsBeside} class:lone={part === "ops"}>
		<div class="col col-main">
			{#if show.what}
				<FormSection
					title="What"
					class="sec-what"
				>
					<Field
						label={inherits ? "Night title" : "Name"}
						for="event-name"
						required={!inherits}
						error={errors.get("event-name")}
						help={inherits ? "Name" : undefined}
					>
						{#snippet actions()}{@render inheritAction("name")}{/snippet}
						{#if follows("name")}
							<InheritedValue value={readout("name")} empty={!seriesText(parentSeries, "name")} />
						{:else}
							<TextField
								id="event-name"
								size="sm"
								autocomplete="off"
								bind:value={form.name}
								placeholder={inherits ? "Halloween special" : isOnce ? "Halloween party" : "Jazz Thursdays"}
							/>
						{/if}
					</Field>
					{#if !isSeries}
					<Field
						class="span-4"
						label="Date"
						for="event-date"
						required
						error={errors.get("event-date")}
					>
						<DateField id="event-date" size="sm" bind:value={form.startsOn} />
					</Field>
					{/if}
					<Field
						class={isSeries ? "span-6" : "span-4"}
						label="Starts"
						for="event-start-time"
						optional={!inherits}
					>
						{#snippet actions()}{@render inheritAction("startTime")}{/snippet}
						{#if follows("startTime")}
							<InheritedValue value={readout("startTime")} empty={!seriesText(parentSeries, "startTime")} />
						{:else}
							<TimeField id="event-start-time" size="sm" bind:value={form.startTime} />
						{/if}
					</Field>
					<Field
						class={isSeries ? "span-6" : "span-4"}
						label="Ends"
						for="event-end-time"
						optional={!inherits}
					>
						{#snippet actions()}{@render inheritAction("endTime")}{/snippet}
						{#if follows("endTime")}
							<InheritedValue value={readout("endTime")} empty={!seriesText(parentSeries, "endTime")} />
						{:else}
							<TimeField
								id="event-end-time"
								size="sm"
								bind:value={form.endTime}
								suggest={form.startTime || "23:00"}
							/>
						{/if}
					</Field>
					<Field
						class="span-6"
						label="Guest/collaboration"
						for="event-artist"
						optional={!inherits}
						help="Guest/collaboration and Guest link"
					>
						{#snippet actions()}{@render inheritAction("artist")}{/snippet}
						{#if follows("artist")}
							<InheritedValue value={readout("artist")} empty={!seriesText(parentSeries, "artist")} />
						{:else}
							<ComboBox
								id="event-artist"
								size="sm"
								bind:value={form.artist}
								placeholder="Artist, DJ or collaborator"
								emptyText="No approved artists yet. Approve them in Play applications."
								options={approvedArtists.map((row) => ({ value: row.id, label: row.name }))}
								onpick={(option) => pickApprovedArtist(option.value)}
							/>
						{/if}
					</Field>
					<Field
						class="span-6"
						label="Guest link"
						for="event-page-url"
						optional={!inherits}
					>
						{#snippet actions()}{@render inheritAction("pageUrl")}{/snippet}
						{#if follows("pageUrl")}
							<InheritedValue value={readout("pageUrl")} empty={!seriesText(parentSeries, "pageUrl")} />
						{:else}
							<TextField
								id="event-page-url"
								size="sm"
								type="text"
								inputmode="url"
								autocomplete="off"
								spellcheck="false"
								bind:value={form.pageUrl}
								placeholder="instagram.com/… or @handle"
							/>
						{/if}
					</Field>
					<Field
						class="span-6"
						label="Offer"
						for="event-offer"
						optional={!inherits}
					>
						{#snippet actions()}{@render inheritAction("offer")}{/snippet}
						{#if follows("offer")}
							<InheritedValue value={readout("offer")} empty={!seriesText(parentSeries, "offer")} />
						{:else}
							<TextField id="event-offer" size="sm" bind:value={form.offer} placeholder="£10 Negroni" />
						{/if}
					</Field>
					{#if current && !inherits}
						<Field
							class="span-6"
							label="Page address"
							for="event-web-address"
							optional
							help="Page address"
							hint={webAddressChanged
								? `New address: gwenda.co.uk/whats-on/${itemSlug(form.webAddress)}. It changes when you press Update website; old links still work.`
								: undefined}
						>
							<TextField
								id="event-web-address"
								size="sm"
								prefix="gwenda.co.uk/whats-on/"
								bind:value={form.webAddress}
								placeholder={current.slug}
								autocomplete="off"
								spellcheck="false"
							/>
						</Field>
					{/if}
					<Field
						label="Card line"
						for="event-short-description"
						optional={!inherits}
						help="Card line and Description"
					>
						{#snippet actions()}{@render inheritAction("shortDescription")}{/snippet}
						{#if follows("shortDescription")}
							<InheritedValue
								value={readout("shortDescription")}
								empty={!seriesText(parentSeries, "shortDescription")}
								prose
							/>
						{:else}
							<TextArea
								id="event-short-description"
								bind:value={form.shortDescription}
								rows={2}
								placeholder={inherits
									? seriesText(parentSeries, "shortDescription") || "On Sat 10 Oct we are excited to host…"
									: "Live jazz from the house trio, every Thursday."}
							/>
						{/if}
					</Field>
					<Field
						label="Description"
						for="event-description"
						required={!inherits}
						error={errors.get("event-description")}
					>
						{#snippet actions()}{@render inheritAction("description")}{/snippet}
						{#if follows("description")}
							<InheritedValue
								value={readout("description")}
								empty={!seriesText(parentSeries, "description")}
								prose
							/>
						{:else}
							<MethodEditor
								id="event-description"
								value={form.description}
								label="Event description"
								placeholder="Set the scene…"
								onChange={(next) => (form.description = next)}
							/>
						{/if}
					</Field>
				</FormSection>
			{/if}
			{#if show.when}
				<FormSection
					title="When"
					class="sec-when"
				>
					<RepeatFields {form} {errors} />
					{#if part === "all" && isSeries && form.repeatUnit !== "none" && nextNights.length}
						<p class="next-nights">
							<span class="next-label">Next</span>
							{nextNights.map((date) => formatDate(date)).join(" · ")}
						</p>
					{/if}
				</FormSection>
			{/if}
			{#if show.slots && !show.slotsBeside}
				<NightScheduleFields {form} {busy} />
			{/if}
			{#if show.ops}
				<FormSection title="Tasks and notes" class="sec-tasks">
					<p class="task-note">
						<Icon name="check" size={15} />
						<span>{taskNote}</span>
					</p>
					<Field
						label="Notes for the team"
						for="event-operations-notes"
						optional={!inherits}
					>
						{#snippet actions()}{@render inheritAction("operationsNotes")}{/snippet}
						{#if follows("operationsNotes")}
							<InheritedValue
								value={readout("operationsNotes")}
								empty={!seriesText(parentSeries, "operationsNotes")}
								prose
							/>
						{:else}
							<TextArea
								id="event-operations-notes"
								bind:value={form.operationsNotes}
								rows={4}
								placeholder="Contacts, fee, setup, access, equipment…"
							/>
						{/if}
					</Field>
				</FormSection>
			{/if}
		</div>
		{#if show.photo}
			<div class="col col-side">
				<!-- A field label, not a group heading: it lines up with Name beside it. -->
				<section class="form-section sec-photo" aria-label="Photo">
					<Field label="Photo" help="Default hero">
						{#snippet actions()}
							{#if inherits}
								{#if photoFollows}
									<button type="button" class="field-link" disabled={busy || !parentSeries} onclick={onoverridephoto}>
										Override
									</button>
								{:else}
									<button type="button" class="field-link" disabled={busy} onclick={onuseseriesphoto}>
										Use series photo
									</button>
								{/if}
							{/if}
							{#if !photoFollows && framingUrl}
								<!-- Replace, download, remove: on the label's row, not a row of their own. -->
								<PhotoActions
									take={{ disabled: busy }}
									replace={{ disabled: busy }}
									remove={{ disabled: busy }}
									download={/^https?:\/\//i.test(framingUrl) ? framingUrl : null}
									onfile={onPhotoFile}
									onremove={onclearphoto}
								/>
							{/if}
						{/snippet}
						<div class="photo-block">
							{#if photoFollows}
								<HeroImagePanel
									heading=""
									sourceUrl={seriesPhotoUrl}
									locked
									onchangecrops={() => undefined}
									onpickfile={() => undefined}
									onclear={() => undefined}
								/>
							{:else}
								<HeroImagePanel
									heading=""
									sourceUrl={framingUrl}
									crops={form.heroCrops}
									disabled={busy}
									ownActions={false}
									onchangecrops={onCropsChange}
									onpickfile={(file) => onpickphoto(file)}
									onclear={onclearphoto}
								/>
							{/if}
							{#if photoFollows || (!eventId && framingUrl)}
								<p class="photo-note">
									{photoFollows ? "This night uses the series photo." : "It uploads when you save."}
								</p>
							{/if}
						</div>
					</Field>
				</section>
			</div>
		{/if}
		{#if show.slotsBeside}
			<div class="col col-side">
				<NightScheduleFields {form} {busy} />
			</div>
		{/if}
	</div>
</div>

<style>
	.board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
		container-type: inline-size;
		container-name: event-board;
	}

	.board > :global(.chooser) {
		border-bottom: 1px solid var(--border);
	}

	.cols.after-chooser {
		padding-top: var(--space-5);
	}

	/* Narrow: one column of sections, the photo straight after What. */
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		min-width: 0;
	}

	.col {
		display: contents;
	}

	.cols :global(.form-section) {
		order: 2;
		padding-block: var(--space-5) var(--space-6);
		border-top: 1px solid var(--border);
	}

	.col-main > :global(.form-section:first-child) {
		order: 0;
		padding-top: 0;
		border-top: 0;
	}

	.cols :global(.sec-photo) {
		order: 1;
	}

	.photo-block {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		max-width: 30rem;
	}

	/* Ops is a few lines of notes: no wider than they read well. */
	.cols.lone {
		max-width: 48rem;
	}

	/* The fields with the photo beside them at the top right. */
	@container event-board (min-width: 42rem) {
		.cols.with-photo {
			grid-template-columns: minmax(0, 1fr) 16rem;
			column-gap: var(--space-8);
		}

		.with-photo > .col {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
			min-width: 0;
		}

		.with-photo > .col-side > :global(.form-section) {
			padding-top: 0;
			border-top: 0;
		}

		/* Skip the What heading's row so the Photo label sits level with Name. */
		.with-photo > .col-side > :global(.sec-photo) {
			padding-top: calc(1.25rem + var(--space-4));
		}

		.photo-block {
			max-width: none;
		}
	}

	/* A wide card gives the photo more room, so the crop is easier to set. */
	@container event-board (min-width: 56rem) {
		.cols.with-photo {
			grid-template-columns: minmax(0, 1fr) clamp(20rem, 28cqi, 30rem);
		}
	}

	/* Schedule: the pattern and times beside the night schedule. */
	@container event-board (min-width: 64rem) {
		.cols.split {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			column-gap: var(--space-8);
		}

		.split > .col {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
			min-width: 0;
		}

		.split > .col-side > :global(.form-section) {
			padding-top: 0;
			border-top: 0;
		}
	}

	.kinds {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
		gap: var(--space-3);
	}

	.kind {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: transparent;
		cursor: pointer;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			background-color var(--t-fast) var(--ease-in-out);
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
		min-width: 0;
	}

	.kind-title {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--foreground);
	}

	.kind-blurb {
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	/* Override and Use series value: small and quiet beside the label. */
	.field-link {
		padding: 0 var(--space-1);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--fg-muted);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 500;
		text-decoration: underline;
		text-decoration-color: var(--border-strong);
		text-underline-offset: 3px;
		white-space: nowrap;
		cursor: pointer;
	}

	.field-link:hover:not(:disabled) {
		color: var(--fg);
		text-decoration-color: currentColor;
	}

	.field-link:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.field-link:disabled {
		color: var(--subtle-foreground);
		cursor: default;
	}

	.next-nights {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--fg-muted);
		font-feature-settings: var(--font-features-num);
	}

	.next-label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--fg-subtle);
	}


	.task-note {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--muted-foreground);
	}

	.task-note :global(svg) {
		flex-shrink: 0;
		margin-top: 0.15rem;
	}

	.photo-note {
		margin: 0;
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
		color: var(--subtle-foreground);
	}

	/* Keep in sync with SHELL_MOBILE_MAX_PX: field actions get a finger-sized target. */
	@media (max-width: 900px) {
		.field-link {
			min-height: 2.75rem;
			margin-block: -0.75rem;
			padding: 0 var(--space-2);
			font-size: var(--text-sm);
		}

		.kind {
			padding: var(--space-3);
		}
	}
</style>
