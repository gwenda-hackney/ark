/**
 * Event descriptions with a little formatting (#33): links, bold, italic,
 * bullet lists and line breaks. Sanity keeps them as Portable Text; the site
 * passes them around as a string in a small Markdown subset, so the paragraph
 * logic (splitting, the series/night merge, length checks) keeps working on
 * strings, and each place that shows one picks HTML or plain text:
 *
 *   paragraphs   separated by a blank line ("\n\n")
 *   line break   "\n" inside a paragraph
 *   bullet list  a paragraph whose every line starts with "- "
 *   **bold**  *italic*  [text](https://…)
 *   \* \[ \] \\  literal characters
 *
 * Links are only ever https, http, mailto, tel or a site path (/…); anything
 * else is dropped to its text, when written and again when shown.
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** The href if it is a link we show, else "". */
export function safeHref(value) {
  const href = String(value ?? "").trim();
  if (!href) return "";
  if (/^\/(?!\/)/.test(href)) return href;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href) && !/\s/.test(href))
    return href;
  return "";
}

/** Text as it sits in the subset: the marker characters escaped. */
function escapeRich(text) {
  return String(text ?? "").replace(/[\\*[\]]/g, (char) => `\\${char}`);
}

/** A plain string (older documents): shown exactly, never read as marks. */
export function plainToRich(text) {
  return escapeRich(String(text ?? "").trim());
}

function spanRich(span) {
  const text = String(span?.text ?? "");
  if (!text) return "";
  const marks = Array.isArray(span?.marks) ? span.marks : [];
  let out = escapeRich(text);
  if (marks.includes("em")) out = `*${out}*`;
  if (marks.includes("strong")) out = `**${out}**`;
  return out;
}

function linkOf(span, markDefs) {
  for (const mark of span?.marks || []) {
    const def = markDefs.find((d) => d?._key === mark && d?._type === "link");
    if (def) return safeHref(def.href);
  }
  return "";
}

function blockRich(block) {
  const markDefs = Array.isArray(block?.markDefs) ? block.markDefs : [];
  const children = Array.isArray(block?.children) ? block.children : [];
  let out = "";
  let i = 0;
  while (i < children.length) {
    const href = linkOf(children[i], markDefs);
    let run = "";
    while (i < children.length && linkOf(children[i], markDefs) === href) {
      run += spanRich(children[i]);
      i += 1;
    }
    out += href && run ? `[${run}](${href.replace(/\)/g, "%29")})` : run;
  }
  return out.trim();
}

/**
 * Sanity Portable Text (or an older plain string) as the subset. Headings
 * become paragraphs and numbered items bullets: the set has neither.
 */
export function portableTextToRich(value) {
  if (typeof value === "string") return plainToRich(value);
  if (!Array.isArray(value)) return "";
  const chunks = [];
  let list = null;
  for (const block of value) {
    if (block?._type !== "block") continue;
    const text = blockRich(block);
    if (!text) continue;
    if (block.listItem) {
      if (!list) chunks.push((list = []));
      list.push(`- ${text.replace(/\s*\n\s*/g, " ")}`);
    } else {
      list = null;
      chunks.push(text);
    }
  }
  return chunks
    .map((chunk) => (Array.isArray(chunk) ? chunk.join("\n") : chunk))
    .join("\n\n");
}

/**
 * Inline text as runs: { text, strong, em, href } plus { br: true } for a
 * line break. Unclosed marks run to the end of the paragraph.
 */
export function parseInline(value) {
  const source = String(value ?? "");
  const runs = [];
  const state = { strong: false, em: false };
  let text = "";
  const flush = (href = "") => {
    if (text) runs.push({ text, strong: state.strong, em: state.em, href });
    text = "";
  };

  const walk = (from, to, href) => {
    let i = from;
    while (i < to) {
      const char = source[i];
      if (char === "\\" && i + 1 < to) {
        text += source[i + 1];
        i += 2;
      } else if (char === "\n") {
        flush(href);
        runs.push({ br: true });
        i += 1;
      } else if (char === "*") {
        flush(href);
        if (source[i + 1] === "*") {
          state.strong = !state.strong;
          i += 2;
        } else {
          state.em = !state.em;
          i += 1;
        }
      } else if (char === "[" && !href) {
        const close = findLinkEnd(source, i, to);
        if (!close) {
          text += char;
          i += 1;
          continue;
        }
        flush();
        walk(i + 1, close.textEnd, safeHref(close.href) || "#plain");
        flush();
        i = close.end;
      } else {
        text += char;
        i += 1;
      }
    }
    flush(href);
  };

  walk(0, source.length, "");
  // A link we don't show keeps its text, unlinked.
  return runs.map((run) =>
    run.href === "#plain" ? { ...run, href: "" } : run,
  );
}

/** `[text](href)` starting at `start`: where its text ends, its href and its end. */
function findLinkEnd(source, start, to) {
  for (let i = start + 1; i < to; i += 1) {
    if (source[i] === "\\") {
      i += 1;
      continue;
    }
    if (source[i] === "[") return null;
    if (source[i] === "]") {
      if (source[i + 1] !== "(") return null;
      const end = source.indexOf(")", i + 2);
      if (end < 0 || end >= to) return null;
      return { textEnd: i, href: source.slice(i + 2, end), end: end + 1 };
    }
  }
  return null;
}

function runsHtml(runs) {
  let out = "";
  let i = 0;
  while (i < runs.length) {
    const href = runs[i].href || "";
    let inner = "";
    while (i < runs.length && (runs[i].href || "") === href) {
      const run = runs[i];
      if (run.br) inner += "<br>";
      else {
        let piece = escapeHtml(run.text);
        if (run.em) piece = `<em>${piece}</em>`;
        if (run.strong) piece = `<strong>${piece}</strong>`;
        inner += piece;
      }
      i += 1;
    }
    if (!href) out += inner;
    else {
      const external = /^https?:/i.test(href);
      out += `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`;
    }
  }
  return out;
}

function isList(paragraph) {
  const lines = paragraph.split("\n");
  return lines.length > 0 && lines.every((line) => /^- /.test(line));
}

/** One paragraph of the subset as HTML: a <p>, or a <ul> for a bullet list. */
export function richParagraphHtml(paragraph) {
  const value = String(paragraph ?? "").trim();
  if (!value) return "";
  if (isList(value)) {
    const items = value
      .split("\n")
      .map((line) => `<li>${runsHtml(parseInline(line.slice(2)))}</li>`);
    return `<ul>${items.join("")}</ul>`;
  }
  return `<p>${runsHtml(parseInline(value))}</p>`;
}

/** A whole description as HTML. */
export function richToHtml(value) {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map(richParagraphHtml)
    .join("");
}

function runsPlain(runs) {
  let out = "";
  let i = 0;
  while (i < runs.length) {
    const href = runs[i].href || "";
    let inner = "";
    while (i < runs.length && (runs[i].href || "") === href) {
      inner += runs[i].br ? "\n" : runs[i].text;
      i += 1;
    }
    const shown = href.replace(/^(mailto|tel):/i, "");
    out += href && shown !== inner.trim() ? `${inner} (${shown})` : inner;
  }
  return out;
}

/**
 * Plain text for meta descriptions, calendar entries and emails: marks
 * dropped, links as "text (url)", bullets as "• ".
 */
export function richToPlain(value) {
  return String(value ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => {
      const trimmed = paragraph.trim();
      if (!trimmed) return "";
      if (isList(trimmed)) {
        return trimmed
          .split("\n")
          .map((line) => `• ${runsPlain(parseInline(line.slice(2)))}`)
          .join("\n");
      }
      return runsPlain(parseInline(trimmed));
    })
    .filter(Boolean)
    .join("\n\n");
}
