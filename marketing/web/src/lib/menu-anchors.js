/**
 * Where each section of the menu is on the website (#240): the page it is
 * on, and the id it has there. Home's tiles, a pop-up kitchen's "See the
 * menu" and the menu pages themselves all ask here, so a link and the place
 * it lands are written once and can't drift apart.
 *
 * A section goes by its `id`: the slug ops gives it when it is made and then
 * leaves alone, whatever staff rename it to (a section with no slug goes by
 * its document id; lib/sanity/queries.ts). Never by its title.
 */

/** The page each menu is on, by a chapter's `kind`. */
const PAGES = new Map([
  ["bar", "/bar"],
  ["kitchen", "/kitchen"],
]);

/**
 * @param {string} [kind] a chapter's `kind`: "bar" (drinks) or "kitchen" (food)
 * @returns {string} that menu's page; the drinks' for a chapter with no kind
 */
export function menuPage(kind) {
  return PAGES.get(kind) || PAGES.get("bar");
}

/** A slug or a document id as an id on a page; a slug ops wrote is unchanged. */
function token(value) {
  return String(value ?? "")
    .trim()
    .replace(/^drafts\./, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The address of every section of a menu: chapters, and the groups under
 * them. A chapter's page comes from its `kind` and a group is on its
 * chapter's page, whatever its own `kind` says (a pop-up kitchen's chapter
 * is food like any other). No two sections on a page share an id: chapters
 * are named first, as theirs are the addresses people already have, and a
 * later section whose id is taken gets a number after it.
 *
 * @param {Array<{ id: string, kind?: string, subsections?: object[] }>} chapters
 *   a menu's chapters as they were fetched, in order: every chapter of a
 *   page, with or without anything on it
 * @returns {(section: object) => { page: string, anchor: string, href: string } | undefined}
 *   where one of those sections is: its page, its id there, and the two as a link
 */
export function menuAddresses(chapters) {
  const found = new Map();
  /** The ids given out so far, page by page. */
  const taken = new Map();

  const place = (section, page) => {
    if (!taken.has(page)) taken.set(page, new Set());
    const ids = taken.get(page);
    const base = token(section.id) || "section";
    let anchor = base;
    for (let n = 2; ids.has(anchor); n += 1) anchor = `${base}-${n}`;
    ids.add(anchor);
    found.set(section, { page, anchor, href: `${page}#${anchor}` });
  };

  for (const chapter of chapters) place(chapter, menuPage(chapter.kind));
  for (const chapter of chapters) {
    for (const group of chapter.subsections || []) {
      place(group, found.get(chapter).page);
    }
  }

  return (section) => found.get(section);
}
