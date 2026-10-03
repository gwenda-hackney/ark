<script lang="ts">
	import { Icon } from "../../app/shell";
	import {
		Button,
		ComboBox,
		DateField,
		Field,
		NativeSelect,
		TextArea,
		TextField,
		TimeField,
		Tip,
	} from "../../ui";
	import type { FormErrors } from "../../ui/form-errors.svelte";
	import MethodEditor from "../../menu/MethodEditor.svelte";
	import type { ApprovedArtist, OpsEvent } from "../../app/api";
	import { itemSlug } from "../../app/nav";
	import HeroImagePanel from "../HeroImagePanel.svelte";
	import { hasMeaningfulFraming, type HeroFraming } from "../hero-crops";
	import {
		lockedReadout as lockedReadoutOf,
		seriesText as seriesTextOf,
		type EventForm,
		type SeriesTextKey,
	} from "../event-form.svelte";

	let {
		form,
		errors,
		current,
		eventId,
		busy,
		isNew,
		newEventRoute,
		creatingNight,
		creatingOnce,
		editingOnce,
		editingOccurrence,
		attachSeriesId = $bindable(),
		seriesOptions,
		approvedArtists,
		webAddressChanged,
		framingUrl,
		onpickphoto,
		onclearphoto,
	}: {
		form: EventForm;
		/** Problems from the last Save, by field id. */
		errors: FormErrors;
		/** The saved event (null while new). */
		current: OpsEvent | null;
		eventId: string;
		busy: boolean;
		isNew: boolean;
		/** "New event" on Schedule: a night for a series, or a special event. */
		newEventRoute: boolean;
		creatingNight: boolean;
		creatingOnce: boolean;
		editingOnce: boolean;
		/** One night of a series: fields stay on the series until defaults are overridden. */
		editingOccurrence: boolean;
		/** The series a new night is added to ("" for a new series or special event). */
		attachSeriesId: string;
		seriesOptions: { value: string; label: string }[];
		/** Approved play applicants, suggested in Guest/collaboration. */
		approvedArtists: ApprovedArtist[];
		webAddressChanged: boolean;
		/** The photo this editor owns (series main, the night's own, or one picked before the first save). */
		framingUrl: string;
		onpickphoto: (file: File | undefined | null) => void;
		onclearphoto: () => void;
	} = $props();

	const locked = $derived(editingOccurrence && !form.defaultsUnlocked);
	const seriesText = (key: SeriesTextKey) => seriesTextOf(current, key);
	const lockedReadout = (key: SeriesTextKey) => lockedReadoutOf(current, key);

	/** Picked from the Guest/collaboration list: their name, and their Instagram or website. */
	function pickApprovedArtist(id: string) {
		const hit = approvedArtists.find((row) => row.id === id);
		if (!hit) return;
		form.artist = hit.name;
		if (hit.link) form.pageUrl = hit.link;
	}

	function onCropsChange(next: HeroFraming | null) {
		form.heroCrops = next && hasMeaningfulFraming(next) ? next : null;
	}
</script>

<section class="details-board">
	<div class="details-main">
		<div
			class="control-grid"
			class:has-slots={!editingOccurrence}
			class:with-series={isNew}
			class:with-date={editingOccurrence || creatingNight || creatingOnce || editingOnce}
		>
			{#if isNew}
				<Field
					class="series"
					label="Series"
					for="event-series"
					width="lg"
					error={errors.get("event-series")}
					hint={newEventRoute
						? "Pick one to add a night to it, or No series for a special event."
						: "Pick one to add a night to it, or New series to start one."}
				>
					<NativeSelect
						id="event-series"
						size="sm"
						bind:value={attachSeriesId}
						options={[
							{
								value: "",
								label: newEventRoute ? "No series (special event)" : "New series",
							},
							...seriesOptions,
						]}
					/>
				</Field>
			{/if}
			{#if editingOccurrence || creatingNight || creatingOnce || editingOnce}
				<Field
					class="when"
					label="Date"
					for="event-date"
					width="sm"
					error={errors.get("event-date")}
					hint={creatingOnce || editingOnce
						? "The night this event happens."
						: "This night only. The series' dates are on Schedule."}
				>
					<DateField id="event-date" size="sm" bind:value={form.startsOn} />
				</Field>
			{/if}
			<Field
				class="start"
				label="Start"
				for="event-start-time"
				width="sm"
				optional
				hint={editingOccurrence ? "From the series unless overridden." : "Each night. A night can change it."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("startTime")}</p>
				{:else}
					<TimeField
						id="event-start-time"
						size="sm"
						bind:value={form.startTime}
					/>
				{/if}
			</Field>
			<Field
				class="end"
				label="End"
				for="event-end-time"
				width="sm"
				optional
				hint={editingOccurrence ? "From the series unless overridden." : "After midnight is fine."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("endTime")}</p>
				{:else}
					<TimeField
						id="event-end-time"
						size="sm"
						bind:value={form.endTime}
						suggest={form.startTime || "23:00"}
					/>
				{/if}
			</Field>
			{#if !editingOccurrence}
				<div class="night-schedule">
					<div class="night-schedule-head">
						<span class="section-label">
							Night schedule
							<Tip
								label="Night schedule"
								tooltip="Slots inside the night, such as Open decks or Chess. Shown in gold on What's on when set."
							/>
						</span>
						<Button
							variant="ghost"
							type="button"
							disabled={busy}
							onclick={() => form.addNightSlot()}
						>
							Add slot
						</Button>
					</div>
					{#if form.nightSchedule.length}
						<ul class="night-schedule-list">
							{#each form.nightSchedule as slot, index (index)}
								<li class="night-slot">
									<TextField
										size="sm"
										placeholder="Open decks"
										bind:value={form.nightSchedule[index].label}
										aria-label={`Slot ${index + 1} label`}
									/>
									<TimeField
										size="sm"
										bind:value={form.nightSchedule[index].startTime}
										aria-label={`Slot ${index + 1} start`}
									/>
									<TimeField
										size="sm"
										bind:value={form.nightSchedule[index].endTime}
										suggest={form.nightSchedule[index].startTime || form.endTime || "23:00"}
										aria-label={`Slot ${index + 1} end`}
									/>
									<button
										class="slot-remove"
										type="button"
										disabled={busy}
										aria-label={`Remove slot ${index + 1}`}
										onclick={() => form.removeNightSlot(index)}
									>
										<Icon name="close" size={12} />
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="hint night-schedule-empty">
							No slots yet. Add open decks, chess, sets, or whatever
							structures the night.
						</p>
					{/if}
				</div>
			{/if}
			<div class="guest guest-group">
			<Field
				label="Guest/collaboration"
				for="event-artist"
				optional
				tooltip={editingOccurrence
					? "From the series until you override defaults. A guest of its own is a special edition on What's on."
					: "Optional default. Type any name, or pick an approved artist from the list (approve them in Play applications) to bring their link too. A night with its own guest is labelled Guest on Upcoming and What's on."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("artist")}</p>
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
				label="Guest/collaboration link"
				for="event-page-url"
				optional
				hint={editingOccurrence
					? "From the series unless overridden. A guest can link their own."
					: "Their Instagram or website. An @handle works."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("pageUrl")}</p>
				{:else}
					<TextField
						id="event-page-url"
						size="sm"
						type="text"
						inputmode="url"
						autocomplete="off"
						spellcheck="false"
						bind:value={form.pageUrl}
						placeholder="Instagram or website link"
					/>
				{/if}
			</Field>
			</div>
			<Field
				class="offer"
				label="Offer"
				for="event-offer"
				optional
				hint={editingOccurrence
					? "From the series unless overridden."
					: "Public wording, like a drink deal. A night can change it."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("offer")}</p>
				{:else}
					<TextField
						id="event-offer"
						size="sm"
						bind:value={form.offer}
						placeholder="£10 Negroni"
					/>
				{/if}
			</Field>
			<Field
				class="span-all"
				label="Short description"
				for="event-short-description"
				optional
				hint={editingOccurrence
					? "From the series unless overridden. The sentence on the What's on card."
					: "The What's on card. One or two lines on what the night is."}
			>
				{#if locked}
					<p class="locked-value">{lockedReadout("shortDescription")}</p>
				{:else}
					<TextArea
						id="event-short-description"
						bind:value={form.shortDescription}
						rows={2}
						placeholder={editingOccurrence
							? seriesText("shortDescription") ||
								"On Sat 10 Oct we are excited to host…"
							: "Card blurb…"}
					/>
				{/if}
			</Field>
			<Field
				class="span-all"
				label={editingOccurrence ? "Description" : "Full description"}
				for="event-description"
				optional={editingOccurrence}
				error={errors.get("event-description")}
				hint={editingOccurrence
					? "From the series unless overridden."
					: "The event's page on the website."}
			>
				{#if locked}
					<p class="locked-value prose">{lockedReadout("description")}</p>
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
			{#if current && !editingOccurrence}
				<Field
					class="span-all"
					label="Web address"
					for="event-web-address"
					optional
					hint={webAddressChanged
						? `New address: gwenda.co.uk/whats-on/${itemSlug(form.webAddress)}. It changes when you press Update website; old links still lead here.`
						: "Letters, numbers and dashes. Old links still lead here if you change it."}
				>
					<div class="web-address">
						<span class="web-address-base">gwenda.co.uk/whats-on/</span>
						<TextField
							id="event-web-address"
							size="sm"
							bind:value={form.webAddress}
							placeholder={current.slug}
							autocomplete="off"
							spellcheck="false"
						/>
					</div>
				</Field>
			{/if}
			<Field
				class="span-all"
				label="Operations notes"
				for="event-operations-notes"
				optional
				hint="For the team only. Never on the website."
			>
				{#if locked}
					<p class="locked-value prose">{lockedReadout("operationsNotes")}</p>
				{:else}
					<TextArea
						id="event-operations-notes"
						bind:value={form.operationsNotes}
						rows={4}
						placeholder="Contacts, fee, setup, access, equipment…"
					/>
				{/if}
			</Field>
		</div>
	</div>
	<aside class="details-side">
		{#if !eventId}
			<p class="hint">Save before adding a photo.</p>
		{/if}
		{#if locked}
			<HeroImagePanel
				sourceUrl={current?.mainImage?.url || ""}
				locked
				tooltip="Series flyer. Override defaults to give this night its own photo. Original downloads the file as uploaded."
				onchangecrops={() => undefined}
				onpickfile={() => undefined}
				onclear={() => undefined}
			/>
		{:else}
			<HeroImagePanel
				sourceUrl={framingUrl}
				crops={form.heroCrops}
				disabled={busy}
				tooltip={editingOccurrence
					? "This night's flyer. What's on uses it while this is the next night. Original downloads the file as uploaded."
					: "What's on shows the next night's flyer when that night has its own photo. This is the fallback. Original downloads the file as uploaded."}
				onchangecrops={onCropsChange}
				onpickfile={(file) => onpickphoto(file)}
				onclear={onclearphoto}
			/>
		{/if}
	</aside>
</section>

<style>
	.hint {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
	}

	.web-address {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.web-address :global(input) {
		flex: 1;
		min-width: 0;
	}

	.web-address-base {
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		white-space: nowrap;
	}

	.locked-value {
		margin: 0;
		min-height: var(--control-h-sm);
		color: var(--muted-foreground);
		font-size: var(--text-sm);
		line-height: 1.4;
	}

	.locked-value.prose {
		white-space: pre-wrap;
		max-height: 7.5rem;
		overflow: auto;
	}

	.section-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.details-board {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-5) var(--space-6);
		align-items: start;
	}

	.details-main, .details-side {
		display: grid;
		gap: var(--space-3);
		align-content: start;
		min-width: 0;
	}

	.details-side {
		order: -1;
	}

	.control-grid {
		--time: 8.25rem;
		--gutter: 0rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3) var(--space-3);
		align-items: start;
		min-width: 0;
	}

	.guest-group {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}

	.control-grid > :global(.span-all), .night-schedule {
		grid-column: 1 / -1;
	}

	.night-schedule {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}

	.night-schedule-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.night-schedule-list {
		display: grid;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.night-slot {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		align-items: center;
	}

	.slot-remove {
		display: grid;
		place-content: center;
		justify-self: start;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-pill);
		background: var(--card);
		color: var(--muted-foreground);
		cursor: pointer;
	}

	.slot-remove:hover:not(:disabled), .slot-remove:focus-visible {
		color: var(--destructive);
		background: var(--destructive-wash);
	}

	.night-schedule-empty {
		margin: 0;
	}

	.hint {
		margin: 0;
	}

	/*
	  One breakpoint. Below it, the photo and every control stack.
	  At it, the photo sits beside the form and paired fields share a row.
	*/
	@container event-detail (min-width: 52rem) {
		.details-board {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.details-side {
			order: 0;
		}

		.control-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.control-grid.has-slots {
			--gutter: 2.15rem;
			margin-right: var(--gutter);
		}

		.control-grid > :global(.series),
		.control-grid > :global(.when) {
			grid-column: 1 / -1;
		}

		.control-grid > :global(.start) {
			grid-column: 1;
		}

		.control-grid > :global(.end) {
			grid-column: 2;
		}

		/* Name and link side by side across the row, so a long link isn't cut short. */
		.control-grid > .guest-group {
			grid-column: 1 / -1;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.control-grid > :global(.offer) {
			grid-column: 1;
		}

		.night-schedule-head {
			margin-right: calc(var(--gutter) * -1);
		}

		.night-slot {
			position: relative;
			grid-template-columns: minmax(0, 1fr) var(--time) var(--time);
			column-gap: var(--space-3);
		}

		.slot-remove {
			position: absolute;
			top: 50%;
			right: calc(var(--gutter) * -1);
			justify-self: auto;
			transform: translateY(-50%);
		}
	}
</style>
