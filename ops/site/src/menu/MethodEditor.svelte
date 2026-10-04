<script lang="ts">
	/**
	 * Method field: TipTap (ProseMirror) WYSIWYG, stored as light Markdown
	 * for Baserow / SpecBook / dilution parsing.
	 */
	import { onDestroy, onMount } from "svelte";
	import { Editor } from "@tiptap/core";
	import StarterKit from "@tiptap/starter-kit";
	import { Markdown } from "@tiptap/markdown";
	import Placeholder from "@tiptap/extension-placeholder";
	import { getFieldContext } from "../ui/field-context";

	let {
		id = "f-method",
		value = "",
		placeholder = "Shake hard with ice…",
		label = "Method",
		disabled = false,
		onChange,
	}: {
		id?: string;
		value?: string;
		placeholder?: string;
		label?: string;
		disabled?: boolean;
		onChange?: (next: string) => void;
	} = $props();

	const field = getFieldContext();
	let host: HTMLDivElement | undefined = $state();
	let editor = $state<Editor | null>(null);
	/** Bumped on every transaction so toolbar active states stay current. */
	let uiTick = $state(0);
	let lastEmitted = "";

	function readMarkdown(ed: Editor): string {
		return (ed.getMarkdown() || "").trim();
	}

	function emit(ed: Editor): void {
		if (disabled) return;
		const next = readMarkdown(ed);
		if (next === lastEmitted) return;
		lastEmitted = next;
		onChange?.(next);
	}

	function setFromOutside(markdown: string): void {
		const ed = editor;
		if (!ed || ed.isDestroyed) return;
		const next = markdown || "";
		if (next === lastEmitted) return;
		lastEmitted = next;
		ed.commands.setContent(next, {
			contentType: "markdown",
			emitUpdate: false,
		});
	}

	onMount(() => {
		if (!host) return;
		lastEmitted = value || "";
		const ed = new Editor({
			element: host,
			editable: !disabled,
			extensions: [
				StarterKit.configure({
					blockquote: false,
					code: false,
					codeBlock: false,
					horizontalRule: false,
					strike: false,
					heading: { levels: [1, 2, 3] },
				}),
				Markdown.configure({
					markedOptions: {
						breaks: false,
						gfm: false,
					},
				}),
				Placeholder.configure({
					placeholder,
					emptyEditorClass: "is-editor-empty",
					emptyNodeClass: "is-empty",
				}),
			],
			content: lastEmitted,
			contentType: "markdown",
			editorProps: {
				attributes: {
					id,
					class: "surface ProseMirror",
					role: "textbox",
					"aria-multiline": "true",
					"aria-label": label,
				},
			},
			onUpdate: ({ editor: next }) => emit(next),
			onTransaction: () => {
				uiTick += 1;
			},
			onBlur: ({ editor: next }) => emit(next),
		});
		editor = ed;
	});

	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});

	$effect(() => {
		const ed = editor;
		if (!ed || ed.isDestroyed) return;
		ed.setEditable(!disabled);
	});

	// Inside a Field: its hint or error for screen readers, like any input.
	$effect(() => {
		const el = editor?.view.dom;
		if (!el) return;
		const describedBy = field?.describedBy;
		if (describedBy) el.setAttribute("aria-describedby", describedBy);
		else el.removeAttribute("aria-describedby");
		if (field?.invalid) el.setAttribute("aria-invalid", "true");
		else el.removeAttribute("aria-invalid");
	});

	$effect(() => {
		const next = value || "";
		const ed = editor;
		if (!ed || ed.isDestroyed) return;
		if (ed.isFocused) return;
		if (next === lastEmitted) return;
		setFromOutside(next);
	});

	function onToolbarMouseDown(event: MouseEvent): void {
		event.preventDefault();
	}

	function run(action: (ed: Editor) => void): void {
		const ed = editor;
		if (!ed || ed.isDestroyed || disabled) return;
		action(ed);
		ed.view.focus();
	}

	function toggleHeading(): void {
		run((ed) => {
			if (ed.isActive("heading", { level: 1 }) || ed.isActive("heading", { level: 2 }) || ed.isActive("heading", { level: 3 })) {
				ed.chain().focus().setParagraph().run();
				return;
			}
			ed.chain().focus().toggleHeading({ level: 2 }).run();
		});
	}

	const boldOn = $derived.by(() => {
		uiTick;
		return Boolean(editor?.isActive("bold"));
	});
	const italicOn = $derived.by(() => {
		uiTick;
		return Boolean(editor?.isActive("italic"));
	});
	const headingOn = $derived.by(() => {
		uiTick;
		return Boolean(
			editor?.isActive("heading", { level: 1 }) ||
				editor?.isActive("heading", { level: 2 }) ||
				editor?.isActive("heading", { level: 3 }),
		);
	});
	const bulletOn = $derived.by(() => {
		uiTick;
		return Boolean(editor?.isActive("bulletList"));
	});
	const numberedOn = $derived.by(() => {
		uiTick;
		return Boolean(editor?.isActive("orderedList"));
	});
</script>

<div class="method-editor" class:disabled class:invalid={field?.invalid}>
	<div class="toolbar" role="toolbar" aria-label={`${label} formatting`} aria-controls={id}>
		<button
			type="button"
			class="tool"
			class:on={boldOn}
			aria-label="Bold"
			aria-pressed={boldOn}
			title="Bold"
			disabled={disabled}
			onmousedown={onToolbarMouseDown}
			onclick={() => run((ed) => ed.chain().focus().toggleBold().run())}
		>
			<span class="glyph bold">B</span>
		</button>
		<button
			type="button"
			class="tool"
			class:on={italicOn}
			aria-label="Italic"
			aria-pressed={italicOn}
			title="Italic"
			disabled={disabled}
			onmousedown={onToolbarMouseDown}
			onclick={() => run((ed) => ed.chain().focus().toggleItalic().run())}
		>
			<span class="glyph italic">I</span>
		</button>
		<span class="sep" aria-hidden="true"></span>
		<button
			type="button"
			class="tool"
			class:on={headingOn}
			aria-label="Heading"
			aria-pressed={headingOn}
			title="Heading"
			disabled={disabled}
			onmousedown={onToolbarMouseDown}
			onclick={toggleHeading}
		>
			<span class="glyph">H</span>
		</button>
		<span class="sep" aria-hidden="true"></span>
		<button
			type="button"
			class="tool"
			class:on={bulletOn}
			aria-label="Bullet list"
			aria-pressed={bulletOn}
			title="Bullet list"
			disabled={disabled}
			onmousedown={onToolbarMouseDown}
			onclick={() => run((ed) => ed.chain().focus().toggleBulletList().run())}
		>
			<span class="glyph">•</span>
		</button>
		<button
			type="button"
			class="tool"
			class:on={numberedOn}
			aria-label="Numbered list"
			aria-pressed={numberedOn}
			title="Numbered list"
			disabled={disabled}
			onmousedown={onToolbarMouseDown}
			onclick={() => run((ed) => ed.chain().focus().toggleOrderedList().run())}
		>
			<span class="glyph">1.</span>
		</button>
	</div>

	<div class="host" bind:this={host}></div>
</div>

<style>
	.method-editor {
		display: grid;
		gap: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-md);
		background: var(--sunken);
		overflow: hidden;
		transition:
			border-color var(--t-fast) var(--ease-in-out),
			box-shadow var(--t-fast) var(--ease-in-out);
	}

	.method-editor:focus-within {
		border-color: var(--ring);
		box-shadow: 0 0 0 3px var(--ring-wash);
	}

	.method-editor.invalid {
		border-color: var(--danger);
	}

	.method-editor.disabled {
		opacity: 0.65;
		pointer-events: none;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.15rem;
		padding: var(--space-1) var(--space-2);
		border-bottom: 1px solid var(--border);
		background: var(--surface-2);
	}

	.tool {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		height: 1.85rem;
		padding: 0 var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		cursor: pointer;
	}

	.tool:hover {
		background: var(--muted, color-mix(in srgb, var(--foreground) 8%, transparent));
	}

	.tool.on {
		background: color-mix(in srgb, var(--foreground) 12%, transparent);
		color: var(--foreground);
	}

	.tool:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 1px;
	}

	.glyph {
		font-family: var(--font);
		font-size: var(--text-sm);
		font-weight: 600;
		line-height: 1;
	}

	.glyph.bold {
		font-weight: 600;
	}

	.glyph.italic {
		font-style: italic;
	}

	.sep {
		width: 1px;
		height: 1.1rem;
		margin: 0 var(--space-1);
		background: var(--border);
	}

	.host {
		min-height: 14rem;
		max-height: 28rem;
		overflow: auto;
	}

	.host :global(.ProseMirror) {
		min-height: 14rem;
		padding: var(--space-3) var(--space-3);
		font-family: var(--font);
		font-size: var(--text-base);
		line-height: 1.5;
		color: var(--foreground);
		outline: none;
	}

	.host :global(.ProseMirror p.is-empty::before),
	.host :global(.ProseMirror p.is-editor-empty::before) {
		content: attr(data-placeholder);
		float: left;
		height: 0;
		pointer-events: none;
		color: var(--subtle-foreground);
	}

	.host :global(.ProseMirror p) {
		margin: 0 0 var(--space-2);
	}

	.host :global(.ProseMirror p:last-child) {
		margin-bottom: 0;
	}

	.host :global(.ProseMirror h1),
	.host :global(.ProseMirror h2),
	.host :global(.ProseMirror h3) {
		margin: var(--space-2) 0 var(--space-1);
		font-family: var(--font);
		font-weight: 600;
		line-height: 1.25;
		color: var(--foreground);
	}

	.host :global(.ProseMirror h1:first-child),
	.host :global(.ProseMirror h2:first-child),
	.host :global(.ProseMirror h3:first-child) {
		margin-top: 0;
	}

	.host :global(.ProseMirror h1) {
		font-size: var(--text-lg);
	}

	.host :global(.ProseMirror h2) {
		font-size: var(--text-md);
	}

	.host :global(.ProseMirror h3) {
		font-size: var(--text-base);
		color: var(--muted-foreground);
	}

	/* Global theme sets li { list-style: none }; restore markers here. */
	.host :global(.ProseMirror ul) {
		margin: 0 0 var(--space-2);
		padding-left: var(--space-5);
	}

	.host :global(.ProseMirror ol) {
		margin: 0 0 var(--space-2);
		padding-left: var(--space-5);
	}

	.host :global(.ProseMirror ul > li) {
		list-style: disc;
		list-style-position: outside;
		margin: 0.15rem 0;
	}

	.host :global(.ProseMirror ol > li) {
		list-style: decimal;
		list-style-position: outside;
		margin: 0.15rem 0;
	}

	.host :global(.ProseMirror strong) {
		font-weight: 600;
	}

	.host :global(.ProseMirror em) {
		font-style: italic;
	}
</style>
