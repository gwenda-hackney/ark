<script lang="ts">
	/**
	 * The shape of an editor while it opens or closes: the back bar, then the
	 * card with a title, tabs, a column of fields and the photo at the right.
	 * Cheap to draw, so the opening move stays smooth.
	 */
	const fields = [
		{ label: 18, wide: true },
		{ label: 26, wide: false },
		{ label: 20, wide: false },
		{ label: 14, wide: false },
		{ label: 22, wide: false },
		{ label: 16, wide: true },
	];
</script>

<div class="placeholder" aria-hidden="true">
	<div class="back"><span class="skel back-line"></span></div>
	<div class="frame">
		<div class="card">
			<div class="head">
				<span class="skel eyebrow"></span>
				<span class="skel title"></span>
			</div>
			<div class="tabs">
				<span class="skel tab"></span>
				<span class="skel tab"></span>
				<span class="skel tab"></span>
			</div>
			<div class="body">
				<div class="fields">
					{#each fields as field, index (index)}
						<div class="field" class:wide={field.wide}>
							<span class="skel label" style:width="{field.label}%"></span>
							<span class="skel input"></span>
						</div>
					{/each}
				</div>
				<div class="photo"><span class="skel photo-box"></span></div>
			</div>
		</div>
	</div>
</div>

<style>
	.placeholder {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		height: 100%;
		container-type: inline-size;
	}

	.back {
		display: flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0 var(--page-gutter);
	}

	.back-line {
		width: 6rem;
		height: 0.75rem;
	}

	.frame {
		flex: 1;
		min-height: 0;
		padding: var(--space-4) var(--page-gutter);
	}

	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-xl);
		background: var(--card);
		box-shadow: var(--shadow-sm);
	}

	.head {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5) var(--card-pad-lg) var(--space-4);
	}

	.eyebrow {
		width: 9rem;
		height: 0.6rem;
	}

	.title {
		width: min(22rem, 60%);
		height: 1.75rem;
	}

	.tabs {
		display: flex;
		gap: var(--space-5);
		padding: var(--space-3) var(--card-pad-lg);
		border-bottom: 1px solid var(--border);
	}

	.tab {
		width: 3.5rem;
		height: 0.8rem;
	}

	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-8);
		padding: var(--space-5) var(--card-pad-lg);
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-5);
		align-content: start;
	}

	.field {
		display: grid;
		gap: var(--space-2);
	}

	.field.wide {
		grid-column: 1 / -1;
	}

	.label {
		height: 0.7rem;
	}

	.input {
		height: var(--control-h-sm);
		border-radius: var(--radius-md);
	}

	.photo {
		display: none;
	}

	.photo-box {
		aspect-ratio: 4 / 3;
		border-radius: var(--radius-md);
	}

	@container (min-width: 44rem) {
		.body {
			grid-template-columns: minmax(0, 1fr) clamp(16rem, 28cqi, 30rem);
		}

		.photo {
			display: block;
		}
	}

	@media (max-width: 900px) {
		.frame {
			padding: 0;
		}

		.card {
			border-radius: 0;
			border-left: 0;
			border-right: 0;
		}
	}
</style>
