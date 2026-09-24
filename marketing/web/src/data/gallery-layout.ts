export type GalleryLayout = {
  /** Number of tiles this layout positions explicitly. */
  count: number;
  /** True when tiles are positioned via named grid areas (a, b, c…). */
  usesAreas: boolean;
  /**
   * Few photos: one row of equal portrait tiles.
   * Masonry starts once there are enough frames to vary.
   */
  equalTiles: boolean;
  columnsDesktop: number;
  rowsDesktop: number;
  areasDesktop: string;
  /** Area letter for each tile, in order. Empty when usesAreas is false. */
  tileAreas: string[];
};

const AREA_LETTERS = "abcdefgh";

type DesktopMap = { cols: number; rows: string[]; equal?: boolean };

/**
 * Hand-tuned maps. One to three photos share one row of equal tiles so a
 * portrait stays a portrait. From four up, varied widths and heights, no
 * empty cells. Each string row lists the area letter in that grid column.
 * Mobile uses a simple vertical list (see global.css); maps are desktop-only.
 */
const DESKTOP_MAPS: Record<number, DesktopMap> = {
  1: { cols: 1, rows: ["a"], equal: true },
  2: { cols: 2, rows: ["a b"], equal: true },
  3: { cols: 3, rows: ["a b c"], equal: true },
  4: {
    cols: 5,
    rows: [
      "a a a b b",
      "a a a b b",
      "a a a c c",
      "d d d c c",
      "d d d c c",
    ],
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
      equalTiles: false,
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
      equalTiles: desktop.equal === true,
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
    equalTiles: false,
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
      `grid-template-areas:${layout.areasDesktop}`,
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

export type GalleryTileSpan = {
  cols: number;
  rows: number;
};

/** Column/row span for a mapped tile — used to size Sanity CDN crops. */
export function getGalleryTileSpan(
  layout: GalleryLayout,
  index: number,
): GalleryTileSpan {
  if (!layout.usesAreas) {
    const span = FALLBACK_SPANS[index % FALLBACK_SPANS.length]!;
    return { cols: span.col, rows: span.row };
  }

  const letter = layout.tileAreas[index];
  if (!letter) return { cols: 1, rows: 1 };

  const rowStrings = [...layout.areasDesktop.matchAll(/"([^"]+)"/g)].map((match) =>
    match[1]!.split(/\s+/),
  );

  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < rowStrings.length; row++) {
    for (let col = 0; col < rowStrings[row]!.length; col++) {
      if (rowStrings[row]![col] === letter) {
        cells.push({ row, col });
      }
    }
  }

  if (cells.length === 0) return { cols: 1, rows: 1 };

  const minRow = Math.min(...cells.map((cell) => cell.row));
  const maxRow = Math.max(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));
  const maxCol = Math.max(...cells.map((cell) => cell.col));

  return {
    cols: maxCol - minCol + 1,
    rows: maxRow - minRow + 1,
  };
}
