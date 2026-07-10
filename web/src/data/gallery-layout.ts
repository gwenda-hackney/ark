export type GalleryLayout = {
  /** Number of tiles this layout positions explicitly. */
  count: number;
  /** True when tiles are positioned via named grid areas (a, b, c…). */
  usesAreas: boolean;
  columnsDesktop: number;
  rowsDesktop: number;
  areasDesktop: string;
  /** Area letter for each tile, in order. Empty when usesAreas is false. */
  tileAreas: string[];
};

const AREA_LETTERS = "abcdefgh";

/**
 * Hand-tuned masonry maps — varied tile widths and heights, no empty cells.
 * Each string row lists the area letter occupying each column of that grid row.
 * Mobile uses a simple vertical list (see global.css); maps are desktop-only.
 */
const DESKTOP_MAPS: Record<number, { cols: number; rows: string[] }> = {
  1: { cols: 1, rows: ["a"] },
  2: { cols: 3, rows: ["a a b", "a a b"] },
  3: { cols: 3, rows: ["a a b", "a a b", "c c c", "c c c"] },
  4: {
    cols: 5,
    rows: ["a a a b b", "a a a b b", "a a a c c", "d d d c c", "d d d c c"],
  },
  5: {
    cols: 4,
    rows: ["a a b b", "a a b b", "a a c c", "d d c c", "d d e e"],
  },
  6: {
    cols: 4,
    rows: ["a a b b", "a a b b", "a a c c", "d d c c", "d d e e", "f f e e"],
  },
};

const MAX_MAPPED = 6;

function areasString(rows: string[]): string {
  return rows.map((row) => `"${row}"`).join(" ");
}

export function getGalleryLayout(count: number): GalleryLayout {
  if (count <= 0) {
    return {
      count: 0,
      usesAreas: false,
      columnsDesktop: 4,
      rowsDesktop: 1,
      areasDesktop: "",
      tileAreas: [],
    };
  }

  if (count <= MAX_MAPPED) {
    const desktop = DESKTOP_MAPS[count]!;
    return {
      count,
      usesAreas: true,
      columnsDesktop: desktop.cols,
      rowsDesktop: desktop.rows.length,
      areasDesktop: areasString(desktop.rows),
      tileAreas: Array.from({ length: count }, (_, i) => AREA_LETTERS[i]!),
    };
  }

  // Fallback for large galleries — dense auto-flow with a repeating span rhythm.
  return {
    count,
    usesAreas: false,
    columnsDesktop: 4,
    rowsDesktop: 0,
    areasDesktop: "",
    tileAreas: [],
  };
}

/** Container inline CSS custom properties for the desktop grid template. */
export function galleryContainerVars(layout: GalleryLayout): string {
  const parts = [`--cols-d:${layout.columnsDesktop}`];

  if (layout.usesAreas) {
    parts.push(
      `--rows-d:${layout.rowsDesktop}`,
      `--areas-d:${layout.areasDesktop}`,
    );
  }

  return parts.join("; ");
}

/** Repeating span rhythm used only for the large-gallery fallback. */
const FALLBACK_SPANS = [
  { col: 2, row: 2 },
  { col: 1, row: 1 },
  { col: 1, row: 1 },
  { col: 2, row: 1 },
  { col: 1, row: 2 },
  { col: 1, row: 1 },
];

/** Per-tile inline style. Uses the mapped area letter, or a fallback span. */
export function galleryTileVars(layout: GalleryLayout, index: number): string {
  if (layout.usesAreas) {
    return `grid-area: ${layout.tileAreas[index]}`;
  }

  const span = FALLBACK_SPANS[index % FALLBACK_SPANS.length]!;
  return `--tile-col:${span.col}; --tile-row:${span.row}`;
}
