/**
 * Tiptap's Markdown output writes `&`, `<`, `>` and quotes as HTML entities
 * ("Q&A" becomes "Q&amp;A"). Descriptions and methods are plain text with a
 * few Markdown marks, never HTML, and the website escapes them when it shows
 * them, so an entity kept here reaches readers as "&amp;". Turn them back.
 */
const ENTITIES: Record<string, string> = {
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&#x27;": "'",
	"&nbsp;": " ",
};

export function editorMarkdownToText(markdown: string): string {
	return String(markdown ?? "")
		.replace(/&(lt|gt|quot|nbsp|#39|#x27);/g, (entity) => ENTITIES[entity])
		.replace(/&amp;/g, "&");
}
