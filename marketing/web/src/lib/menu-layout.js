/**
 * How a menu page is laid out (#240): chapters go two abreast, dealt left
 * then right, so the first two start level at the top (the house cocktails
 * beside the classics). A chapter of nothing but beer breaks the columns
 * and runs the full width as its own band, so the page reads cocktails,
 * beer, then the rest. A menu of one chapter flows down both columns.
 */

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
