/**
 * Words typed straight into the email's preview, back into what an email
 * stores (shared/email/sections.js): a heading is one line of plain text;
 * copy is paragraphs with two marks, **bold** and [words](https://link).
 * Whatever the browser makes while someone types (a <b>, a <div> for a new
 * line, a pasted <span>, &nbsp;) comes back as those and nothing else.
 */

/** Elements that start a new paragraph. */
const BLOCKS = new Set(["P", "DIV", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TABLE", "TR", "TD"]);

const isElement = (node: Node): node is Element => node.nodeType === 1;

function isBold(el: Element): boolean {
	if (el.tagName === "B" || el.tagName === "STRONG") return true;
	const weight = (el as HTMLElement).style?.fontWeight || "";
	return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
}

/** **words**, with the spaces either side kept outside the stars (or the marks don't hold). */
function bold(words: string): string {
	const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(words) || ["", "", words, ""];
	if (!inner) return words;
	// A line break can't sit inside the marks: bold each line on its own.
	return `${before}${inner
		.split("\n")
		.map((part) => (part.trim() ? `**${part.trim()}**` : part))
		.join("\n")}${after}`;
}

/** One node's words, with its marks: inside a link only the words count, and bold inside bold once. */
function inline(node: Node, inBold: boolean, inLink: boolean): string {
	if (node.nodeType === 3) return (node.nodeValue || "").replace(/ /g, " ");
	if (!isElement(node)) return "";
	if (node.tagName === "BR") return "\n";
	const children = (asBold = inBold, asLink = inLink) =>
		Array.from(node.childNodes)
			.map((child) => inline(child, asBold, asLink))
			.join("");
	if (node.tagName === "A" && !inLink) {
		const href = (node.getAttribute("href") || "").trim();
		const words = children(true, true).replace(/\s+/g, " ").trim();
		if (!words) return "";
		return href ? `[${words}](${href})` : words;
	}
	if (!inBold && !inLink && isBold(node)) return bold(children(true, inLink));
	return children();
}

/** A paragraph tidied: runs of spaces as one, no spaces at the ends of its lines, no empty lines at its ends. */
function tidy(paragraph: string): string {
	return paragraph
		.split("\n")
		.map((line) => line.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/^\n+|\n+$/g, "");
}

/** The paragraphs inside `host`: each block its own, and loose words between blocks one more. */
function paragraphsOf(host: Node): string[] {
	const out: string[] = [];
	let loose = "";
	const flush = () => {
		out.push(loose);
		loose = "";
	};
	for (const child of Array.from(host.childNodes)) {
		if (isElement(child) && BLOCKS.has(child.tagName)) {
			flush();
			// A block inside a block (a pasted <div> in a <p>) still breaks the paragraph.
			if (Array.from(child.childNodes).some((inner) => isElement(inner) && BLOCKS.has(inner.tagName))) {
				out.push(...paragraphsOf(child));
			} else {
				out.push(inline(child, false, false));
			}
		} else {
			loose += inline(child, false, false);
		}
	}
	flush();
	return out.map(tidy).filter(Boolean);
}

/** A copy section's text from its cell in the preview. */
export function copyFromDom(host: Node): string {
	return paragraphsOf(host).join("\n\n");
}

/** A heading's text from its element in the preview: one line. */
export function headingFromDom(el: Node): string {
	return (el.textContent || "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * What someone typed as a link, as an address an email can carry: a web
 * address (https:// added when they left it off), or an email address
 * (mailto: added); "" when it's neither.
 */
export function linkAddress(typed: string): string {
	const value = typed.trim();
	if (!value || /\s/.test(value)) return "";
	if (/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value)) return value;
	if (/^[^@\s/:]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
	const web = /^https?:\/\//i.test(value) ? value : `https://${value}`;
	try {
		const url = new URL(web);
		return url.hostname.includes(".") ? web : "";
	} catch {
		return "";
	}
}
