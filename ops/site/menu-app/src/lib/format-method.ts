/**
 * Method copy is stored as plain text (Baserow). Light Markdown only:
 * # headings, paragraphs, line breaks, **bold**, *italic*, - bullets, 1. steps.
 * Escape first, then apply marks — never feed raw HTML through.
 */

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function inlineMarks(value: string): string {
	return value
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
}

function formatInline(value: string): string {
	return inlineMarks(escapeHtml(value));
}

type Block =
	| { type: "p"; lines: string[] }
	| { type: "h"; level: 1 | 2 | 3; text: string }
	| { type: "ul" | "ol"; items: string[] };

function parseBlocks(raw: string): Block[] {
	const lines = raw.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let para: string[] = [];
	let list: { type: "ul" | "ol"; items: string[] } | null = null;

	const flushPara = () => {
		if (!para.length) return;
		blocks.push({ type: "p", lines: para });
		para = [];
	};

	const flushList = () => {
		if (!list) return;
		blocks.push(list);
		list = null;
	};

	for (const line of lines) {
		const heading = line.match(/^\s*(#{1,3})\s*(.+?)\s*$/);
		if (heading && heading[2].trim()) {
			flushPara();
			flushList();
			blocks.push({
				type: "h",
				level: heading[1].length as 1 | 2 | 3,
				text: heading[2].trim(),
			});
			continue;
		}

		const bullet = line.match(/^\s*[-*]\s+(.+)$/);
		const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
		if (bullet || numbered) {
			flushPara();
			const type = bullet ? "ul" : "ol";
			const item = (bullet || numbered)![1].trim();
			if (!list || list.type !== type) {
				flushList();
				list = { type, items: [item] };
			} else {
				list.items.push(item);
			}
			continue;
		}

		if (!line.trim()) {
			flushPara();
			flushList();
			continue;
		}

		flushList();
		para.push(line.trimEnd());
	}
	flushPara();
	flushList();
	return blocks;
}

function renderBlock(block: Block): string {
	if (block.type === "h") {
		const tag = `h${block.level}`;
		return `<${tag}>${formatInline(block.text)}</${tag}>`;
	}
	if (block.type === "p") {
		const body = block.lines.map((line) => formatInline(line.trimStart())).join("<br />");
		return `<p>${body}</p>`;
	}
	const tag = block.type;
	const items = block.items.map((item) => `<li>${formatInline(item)}</li>`).join("");
	return `<${tag}>${items}</${tag}>`;
}

/** Safe HTML for SpecBook / print. Empty input → "". */
export function formatMethodHtml(raw: string | undefined | null): string {
	const text = typeof raw === "string" ? raw.trim() : "";
	if (!text) return "";
	return parseBlocks(text).map(renderBlock).join("");
}

function decodeEntities(value: string): string {
	return value
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

/** Strip tags we emit / contenteditable produces, back to light Markdown. */
function inlineHtmlToMd(html: string): string {
	let s = html;
	s = s.replace(/<br\s*\/?>/gi, "\n");
	for (let i = 0; i < 4; i++) {
		s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => `**${inner}**`);
		s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => `*${inner}*`);
	}
	s = s.replace(/<[^>]+>/g, "");
	return decodeEntities(s).replace(/\u00a0/g, " ");
}

function listHtmlToMd(inner: string, type: "ul" | "ol"): string {
	const items = [...inner.matchAll(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi)];
	if (!items.length) {
		const plain = inlineHtmlToMd(inner).trim();
		return plain ? (type === "ul" ? `- ${plain}` : `1. ${plain}`) : "";
	}
	return items
		.map((row, index) => {
			const body = inlineHtmlToMd(row[1])
				.replace(/\n+/g, " ")
				.trim();
			if (!body) return type === "ul" ? "-" : `${index + 1}.`;
			return type === "ul" ? `- ${body}` : `${index + 1}. ${body}`;
		})
		.join("\n");
}

function inlineDomToMd(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return (node.textContent || "").replace(/\u00a0/g, " ");
	}
	if (!(node instanceof HTMLElement)) return "";
	const tag = node.tagName.toLowerCase();
	if (tag === "br") return "\n";
	if (tag === "strong" || tag === "b") {
		return `**${Array.from(node.childNodes).map(inlineDomToMd).join("")}**`;
	}
	if (tag === "em" || tag === "i") {
		return `*${Array.from(node.childNodes).map(inlineDomToMd).join("")}*`;
	}
	return Array.from(node.childNodes).map(inlineDomToMd).join("");
}

function blockDomToMd(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		const text = (node.textContent || "").replace(/\u00a0/g, " ").trim();
		return text;
	}
	if (!(node instanceof HTMLElement)) return "";
	const tag = node.tagName.toLowerCase();
	if (tag === "h1" || tag === "h2" || tag === "h3") {
		const text = inlineDomToMd(node).replace(/\n+/g, " ").trim();
		return text ? `${"#".repeat(Number(tag[1]))} ${text}` : "";
	}
	if (tag === "ul" || tag === "ol") {
		const items = Array.from(node.children).filter(
			(child) => child.tagName.toLowerCase() === "li",
		);
		return items
			.map((li, index) => {
				const body = inlineDomToMd(li).replace(/\n+/g, " ").trim();
				if (!body) return tag === "ul" ? "-" : `${index + 1}.`;
				return tag === "ul" ? `- ${body}` : `${index + 1}. ${body}`;
			})
			.join("\n");
	}
	if (tag === "p" || tag === "div") {
		return inlineDomToMd(node).replace(/[ \t]+\n/g, "\n").trim();
	}
	if (tag === "br") return "";
	// Unknown wrapper: flatten children as blocks.
	return Array.from(node.childNodes)
		.map(blockDomToMd)
		.filter(Boolean)
		.join("\n\n");
}

function markdownFromDom(root: ParentNode): string {
	return Array.from(root.childNodes)
		.map(blockDomToMd)
		.filter(Boolean)
		.join("\n\n")
		.trim();
}

function markdownFromHtmlString(html: string): string {
	const normalized = html
		.replace(/&nbsp;/gi, " ")
		.replace(/<div(?:\s[^>]*)?><br\s*\/?><\/div>/gi, "<p></p>")
		.replace(/<div(?:\s[^>]*)?>/gi, "<p>")
		.replace(/<\/div>/gi, "</p>");

	const blockRe = /<(h[1-3]|p|ul|ol)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
	const parts: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = blockRe.exec(normalized))) {
		const tag = match[1].toLowerCase();
		const inner = match[2];
		if (tag.startsWith("h")) {
			const text = inlineHtmlToMd(inner).replace(/\n+/g, " ").trim();
			if (text) parts.push(`${"#".repeat(Number(tag[1]))} ${text}`);
			continue;
		}
		if (tag === "ul" || tag === "ol") {
			const list = listHtmlToMd(inner, tag);
			if (list) parts.push(list);
			continue;
		}
		const para = inlineHtmlToMd(inner).replace(/[ \t]+\n/g, "\n").trim();
		if (para) parts.push(para);
	}

	if (!parts.length) {
		return inlineHtmlToMd(normalized).trim();
	}
	return parts.join("\n\n").trim();
}

/**
 * Convert editor / SpecBook HTML back to the Markdown we store in Baserow.
 * Prefers DOMParser in the browser so contenteditable lists survive.
 */
export function htmlToMarkdown(html: string | undefined | null): string {
	const input = typeof html === "string" ? html.trim() : "";
	if (!input) return "";

	if (typeof DOMParser !== "undefined") {
		try {
			const doc = new DOMParser().parseFromString(
				`<div id="method-root">${input}</div>`,
				"text/html",
			);
			const root = doc.getElementById("method-root");
			if (root) return markdownFromDom(root);
		} catch {
			/* fall through to string path */
		}
	}

	return markdownFromHtmlString(input);
}

/** Empty editor surface HTML (one blank paragraph). */
export function emptyMethodHtml(): string {
	return "<p><br></p>";
}

