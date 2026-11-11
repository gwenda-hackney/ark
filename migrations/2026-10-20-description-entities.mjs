/**
 * Event text saved with HTML entities. The description editor (#165) wrote
 * its Markdown with them until this fix, so "Q&A" was stored as "Q&amp;A",
 * and the website, which escapes text itself, showed "Q&amp;A".
 *
 * Decodes them in the ops events (name, short description, description, and
 * each night's overrides) and in the Sanity events and series, published and
 * drafts, so ops and the website agree without anyone republishing. After
 * the ops deploy, so the editor no longer writes them. Safe to run again: it
 * only touches text that still holds an entity. Supports --dry-run.
 */
import { all, batch, statement } from "../shared/d1.js";

export const app = "ops";
export const phase = "post";
export const about = "Event text: &amp; and other HTML entities back to the characters typed";

const ENTITY = /&(amp|lt|gt|quot|nbsp|#39|#x27);/;
const CHARACTERS = { lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'", "#x27": "'" };

/** One pass, like the editor fix: "&amp;lt;" becomes "&lt;", not "<". */
export function decodeEntities(value) {
  return String(value ?? "").replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, (_, name) =>
    name === "amp" ? "&" : CHARACTERS[name],
  );
}

const hasEntity = (value) => typeof value === "string" && ENTITY.test(value);

/** A night's overrides with every string decoded, or null when none needed it. */
export function decodeOverrides(text) {
  let overrides;
  try {
    overrides = JSON.parse(text || "{}");
  } catch {
    return null;
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return null;
  let changed = false;
  for (const [key, value] of Object.entries(overrides)) {
    if (!hasEntity(value)) continue;
    overrides[key] = decodeEntities(value);
    changed = true;
  }
  return changed ? JSON.stringify(overrides) : null;
}

/** The `set` patch for a Sanity event or series, or null when it is clean. */
export function sanityPatch(doc) {
  const set = {};
  for (const field of ["title", "shortDescription"]) {
    if (hasEntity(doc[field])) set[field] = decodeEntities(doc[field]);
  }
  const blocks = Array.isArray(doc.description) ? doc.description : null;
  if (blocks?.some((block) => block?.children?.some((span) => hasEntity(span?.text)))) {
    set.description = blocks.map((block) =>
      Array.isArray(block?.children)
        ? {
            ...block,
            children: block.children.map((span) =>
              hasEntity(span?.text) ? { ...span, text: decodeEntities(span.text) } : span,
            ),
          }
        : block,
    );
  }
  return Object.keys(set).length ? set : null;
}

export async function up({ d1, sanity, log, dryRun = false }) {
  const ops = await d1("ops");
  const events = (
    await all(ops, "SELECT id, name, short_description, description FROM events")
  ).filter((row) => [row.name, row.short_description, row.description].some(hasEntity));
  const nights = (await all(ops, "SELECT id, overrides FROM event_dates"))
    .map((row) => ({ id: row.id, overrides: decodeOverrides(row.overrides) }))
    .filter((row) => row.overrides);

  log(
    `ops D1: ${events.length} events (${events.map((row) => row.name).join(", ") || "none"}), ` +
      `${nights.length} nights to fix`,
  );
  if (!dryRun && (events.length || nights.length)) {
    await batch(ops, [
      ...events.map((row) =>
        statement(ops, "UPDATE events SET name = ?, short_description = ?, description = ? WHERE id = ?", [
          decodeEntities(row.name),
          decodeEntities(row.short_description),
          decodeEntities(row.description),
          row.id,
        ]),
      ),
      ...nights.map((row) =>
        statement(ops, "UPDATE event_dates SET overrides = ? WHERE id = ?", [row.overrides, row.id]),
      ),
    ]);
  }

  const content = sanity();
  const documents =
    (await content.query(
      `*[_type in ["event", "eventSeries"]]{ _id, title, shortDescription, description }`,
    )) || [];
  const patches = documents
    .map((doc) => ({ id: doc._id, set: sanityPatch(doc) }))
    .filter((patch) => patch.set);
  log(`${content.project}: ${patches.length} documents to fix${patches.length ? ` (${patches.map((p) => p.id).join(", ")})` : ""}`);
  if (!dryRun && patches.length) {
    await content.mutate(patches.map(({ id, set }) => ({ patch: { id, set } })));
  }
}
