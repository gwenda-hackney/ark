/**
 * Home's row of deals and pop-up kitchens (#240, StandingCards on home):
 * how many of each show, and how the row is set. Every one of them is on
 * What's on.
 */

/** Home shows at most this many of each kind; the rest are on What's on. */
export const HOME_STANDS = 3;

/**
 * Each kind's share of the row: the first few (the lists come in the order
 * they next come round, so the next ones running), and how many more there
 * are. A kind with none isn't in it, so the other takes the row. The row is
 * compact (small pictures, one card under another) once any kind has more
 * than one card.
 *
 * @template {{ cards: unknown[] }} S
 * @param {S[]} sections each kind, in the row's order
 * @param {number} [limit] how many of each show
 * @returns {{ sections: Array<S & { more: number }>, compact: boolean }}
 */
export function homeStandRow(sections, limit = HOME_STANDS) {
  const shown = (sections || [])
    .filter((section) => section?.cards?.length > 0)
    .map((section) => ({
      ...section,
      cards: section.cards.slice(0, limit),
      more: Math.max(0, section.cards.length - limit),
    }));
  return {
    sections: shown,
    compact: shown.some((section) => section.cards.length > 1),
  };
}
