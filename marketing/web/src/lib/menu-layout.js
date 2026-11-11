/**
 * How a menu page is laid out (#240): chapters go two abreast, dealt left
 * then right, so the first two start level at the top (the house cocktails
 * beside the classics). A chapter of nothing but beer breaks the columns
 * and runs the full width as its own band, so the page reads cocktails,
 * beer, then the rest. A menu of one chapter flows down both columns.
 *
 * menuSheet is the whole page for the templates to print: what is drawn,
 * in which rows, and the id on each chapter and group that links land on.
 */

import { menuAddresses } from "./menu-anchors.js";

const BEER_TYPES = new Set(["beer", "packaged"]);

function items(chapter) {
  return [chapter, ...(chapter.subsections || [])].flatMap((part) =>
    (part.items || []).filter((item) => item.available !== false),
  );
}

/** A chapter where everything on it is beer, on draught or in bottles. */
export function isBeerChapter(chapter) {
  const all = items(chapter);
  return all.length > 0 && all.every((item) => BEER_TYPES.has(item.drinkType));
}

/**
 * @param {Array<{ id: string, items: object[], subsections?: object[] }>} chapters
 *   the chapters with anything on them, in order
 * @returns {Array<
 *   | { layout: "flow", chapters: Array<{ chapter: object, order: number }> }
 *   | { layout: "band", chapters: Array<{ chapter: object, order: number }> }
 *   | { layout: "columns", columns: Array<Array<{ chapter: object, order: number }>> }
 * >} rows down the page; `order` is each chapter's place, for a phone
 */
export function menuRows(chapters) {
  const numbered = chapters.map((chapter, order) => ({ chapter, order }));
  if (numbered.length === 1) return [{ layout: "flow", chapters: numbered }];

  const rows = [];
  let run = [];
  const closeRun = () => {
    if (!run.length) return;
    rows.push({
      layout: "columns",
      columns: [0, 1].map((side) => run.filter((_, i) => i % 2 === side)),
    });
    run = [];
  };
  for (const entry of numbered) {
    if (isBeerChapter(entry.chapter)) {
      closeRun();
      rows.push({ layout: "band", chapters: [entry] });
    } else run.push(entry);
  }
  closeRun();
  return rows;
}

/** A chapter or group with something on it, of its own or in its groups. */
function hasContent(section) {
  return items(section).length > 0;
}

/**
 * The menu page, ready to draw: the chapters with anything on them, each
 * with the id it has on the page (lib/menu-anchors.js) and its groups: its
 * own items first, under no head, then each group with something on it.
 * A chapter or group with nothing on it isn't drawn, and has no id.
 *
 * @param {Array<{ id: string, kind?: string, items: object[], subsections?: object[] }>} chapters
 *   one menu's chapters as they were fetched, in order
 * @returns {{
 *   chapters: Array<{ chapter: object, id: string, groups: Array<{ section: object, id?: string }> }>,
 *   rows: ReturnType<typeof menuRows>,
 * }} the chapters in order, for the links that jump to them, and the same
 *   laid out in rows (menuRows), each entry with its `id` and `groups`
 */
export function menuSheet(chapters) {
  const where = menuAddresses(chapters);
  const drawn = new Map(
    chapters.filter(hasContent).map((chapter) => [
      chapter,
      {
        chapter,
        id: where(chapter).anchor,
        groups: [chapter, ...(chapter.subsections || [])]
          .filter(hasContent)
          .map((section) =>
            section === chapter
              ? { section }
              : { section, id: where(section).anchor },
          ),
      },
    ]),
  );
  const place = ({ chapter, order }) => ({ ...drawn.get(chapter), order });

  return {
    chapters: [...drawn.values()],
    rows: menuRows([...drawn.keys()]).map((row) =>
      row.layout === "columns"
        ? { ...row, columns: row.columns.map((column) => column.map(place)) }
        : { ...row, chapters: row.chapters.map(place) },
    ),
  };
}
