<script lang="ts">
	/**
	 * The event editor's fields, in the order the job is done: what it is,
	 * when it happens, what the website says, the photo, then the team's
	 * notes and tasks. A new form starts with the chooser. A night shows each
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
		nightsHref,
		onkind,
		onoverride,
		onuseseries,
		onoverridephoto,
		onuseseriesphoto,
		onpickphoto,
		onclearphoto,
	}: {
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
		/** The Nights tab, for "See all". */
		nightsHref: string;
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

<div class="board" class:has-chooser={isNew}>
	{#if isNew}
		<FormSection title="What are you adding?" columns={1} class="chooser">
			<div class="kinds span-all" role="radiogroup" aria-label="What are you adding?">
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
				<Field label="Series" for="event-series" width="lg" error={errors.get("event-series")}>
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

	<div class="col-main">
		<FormSection
			title="What"
			class="sec-what"
			description={inherits
				? "This night takes its title and guest from the series. Override one to change it for this night."
				: undefined}
		>
			<Field
				class="span-all"
				label={inherits ? "Night title" : "Name"}
				for="event-name"
				width="lg"
				optional={inherits && form.isOverridden("name")}
				error={errors.get("event-name")}
				hint={inherits && form.isOverridden("name") ? "Shown instead of the series name for this night." : undefined}
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
			<Field
				label="Guest/collaboration"
				for="event-artist"
				optional={!inherits}
				hint={follows("artist")
					? undefined
					: inherits
						? "A guest of its own makes this a special edition on What's on."
						: "Any name, or pick an approved artist to bring their link too."}
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
				label="Guest link"
				for="event-page-url"
				optional={!inherits}
				hint={follows("pageUrl") ? undefined : "Instagram or website. An @handle works."}
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
		</FormSection>

		<FormSection
			title="When"
			class="sec-when"
			description={isSeries
				? "How often it runs, its first and last night, and the times each night."
				: undefined}
		>
			{#if isSeries}
				<RepeatFields {form} {errors} />
			{/if}
			<div class="field-row">
				{#if !isSeries}
					<Field
						label="Date"
						for="event-date"
						width="sm"
						error={errors.get("event-date")}
						hint={editingOccurrence ? "Change it to move this night only." : undefined}
					>
						<DateField id="event-date" size="sm" bind:value={form.startsOn} />
					</Field>
				{/if}
				<Field
					label="Starts"
					for="event-start-time"
					width="sm"
					optional={!inherits}
					hint={!inherits && isSeries ? "Each night. A night can change it." : undefined}
				>
					{#snippet actions()}{@render inheritAction("startTime")}{/snippet}
					{#if follows("startTime")}
						<InheritedValue value={readout("startTime")} empty={!seriesText(parentSeries, "startTime")} />
					{:else}
						<TimeField id="event-start-time" size="sm" bind:value={form.startTime} />
					{/if}
				</Field>
				<Field
					label="Ends"
					for="event-end-time"
					width="sm"
					optional={!inherits}
					hint={follows("endTime") ? undefined : "After midnight is fine."}
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
			</div>
			{#if isSeries && form.repeatUnit !== "none" && nextNights.length}
				<p class="next-nights span-all">
					<span class="next-label">Next</span>
					{nextNights.map((date) => formatDate(date)).join(" · ")}
					{#if eventId && previewDates.length > nextNights.length}
						<a href={nightsHref}>See all {previewDates.length}</a>
					{/if}
				</p>
			{/if}
			{#if !editingOccurrence}
				<NightScheduleFields {form} {busy} />
			{/if}
		</FormSection>

		<FormSection
			title="On the website"
			class="sec-page"
			description={inherits
				? "The night's card and page use the series' words unless you override them."
				: "The What's on card and the event's own page."}
		>
			<Field
				class="span-all"
				label="Offer"
				for="event-offer"
				width="lg"
				optional={!inherits}
				hint={follows("offer") ? undefined : "Public wording, like a drink deal."}
			>
				{#snippet actions()}{@render inheritAction("offer")}{/snippet}
				{#if follows("offer")}
					<InheritedValue value={readout("offer")} empty={!seriesText(parentSeries, "offer")} />
				{:else}
					<TextField id="event-offer" size="sm" bind:value={form.offer} placeholder="£10 Negroni" />
				{/if}
			</Field>
			<Field
				class="span-all"
				label="Card line"
				for="event-short-description"
				optional={!inherits}
				hint={follows("shortDescription")
					? undefined
					: "One or two lines on the What's on card."}
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
				class="span-all"
				label="Description"
				for="event-description"
				optional={inherits}
				error={errors.get("event-description")}
				hint={follows("description") ? undefined : "The event's own page on the website."}
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
			{#if current && !inherits}
				<Field
					class="span-all"
					label="Page address"
					for="event-web-address"
					optional
					hint={webAddressChanged
						? `New address: gwenda.co.uk/whats-on/${itemSlug(form.webAddress)}. It changes when you press Update website; old links still work.`
						: "Letters, numbers and dashes. Old links still work if you change it."}
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
		</FormSection>

		<FormSection title="Tasks and notes" class="sec-tasks" columns={1}>
			<p class="task-note">
				<Icon name="check" size={15} />
				<span>{taskNote}</span>
			</p>
			<Field
				label="Notes for the team"
				for="event-operations-notes"
				optional={!inherits}
				hint={follows("operationsNotes") ? undefined : "Never on the website."}
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
	</div>

	<div class="col-side">
		<FormSection
			title="Photo"
			class="sec-photo"
			columns={1}
			description={photoFollows
				? "This night uses the series photo."
				: inherits
					? "This night's own flyer. What's on uses it while this is the next night."
					: "The What's on flyer. Drag the gold frame to choose the card crop."}
		>
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
			{/snippet}
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
					onchangecrops={onCropsChange}
					onpickfile={(file) => onpickphoto(file)}
					onclear={onclearphoto}
				/>
				{#if !eventId && framingUrl}
					<p class="photo-note">It uploads when you save.</p>
				{/if}
			{/if}
		</FormSection>
	</div>
</div>

<style>
	.board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		align-items: start;
	}

	.col-main,
	.col-side {
		display: grid;
		gap: var(--space-4);
		align-content: start;
		min-width: 0;
	}

	/* Phones: one column, the photo straight after what the event is. */
	@container event-detail (max-width: 51.99rem) {
		.col-main,
		.col-side {
			display: contents;
		}

		.board > :global(.chooser) {
			order: 0;
		}

		.col-main > :global(.sec-what) {
			order: 1;
		}

		.col-side > :global(.sec-photo) {
			order: 2;
		}

		.col-main > :global(.sec-when) {
			order: 3;
		}

		.col-main > :global(.sec-page) {
			order: 4;
		}

		.col-main > :global(.sec-tasks) {
			order: 5;
		}
	}

	/* Wide: the fields on the left, the photo beside them and kept in view. */
	@container event-detail (min-width: 52rem) {
		.board {
			grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
			gap: var(--space-5);
		}

		.board > :global(.chooser) {
			grid-column: 1 / -1;
		}

		.col-side {
			position: sticky;
			top: 0;
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

	.field-link {
		padding: 0 var(--space-1);
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--primary);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}

	.field-link:hover:not(:disabled) {
		text-decoration: underline;
		text-underline-offset: 3px;
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
		color: var(--foreground);
		font-feature-settings: var(--font-features-num);
	}

	.next-label {
		font-size: var(--text-2xs);
		font-weight: 600;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.next-nights a {
		color: var(--primary);
		font-size: var(--text-xs);
		font-weight: 600;
		text-decoration: none;
	}

	.next-nights a:hover {
		text-decoration: underline;
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
