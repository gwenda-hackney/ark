/**
 * Guest print menu chapter tree.
 * Our Formulas and Free of Spirit hold drinks directly.
 * By the Book and The Cabinet group drinks under subsections.
 */
export const PRINT_MENU_CHAPTERS = [
  {
    title: "Our Formulas",
    slug: "our-formulas",
    subtitle:
      "The definitive liquid experience. Elegant expressions crafted for candlelit evenings.",
  },
  {
    title: "Free of Spirit",
    slug: "free-of-spirit",
    subtitle:
      "The mindful liquid experience. Zero-proof expressions crafted with the same complexity.",
  },
  {
    title: "By the Book",
    slug: "by-the-book",
    subtitle: "The traditional liquid ritual. Timeless serves, made as you know them.",
    subsections: [
      { title: "Spritz", slug: "spritz" },
      { title: "Negroni", slug: "negroni" },
      { title: "Sour", slug: "sour" },
      { title: "Highball", slug: "highball" },
      { title: "Bottled Beer", slug: "bottled-beer" },
      { title: "Draught Beer", slug: "draught-beer" },
    ],
  },
  {
    title: "The Cabinet",
    slug: "the-cabinet",
    subtitle:
      "The liquid cabinet. Agave, rum, whiskey, and digestivi for the quieter close.",
    subsections: [
      { title: "Agave", slug: "agave" },
      { title: "Rum", slug: "rum" },
      { title: "Whiskey", slug: "whiskey" },
      { title: "Amaro & Digestivi", slug: "amaro-digestivi" },
    ],
  },
];

/** Chapters then subsections, with parentSlug on nested groups. */
export function flattenPrintMenuSections(chapters = PRINT_MENU_CHAPTERS) {
  return chapters.flatMap((chapter) => [
    chapter,
    ...(chapter.subsections ?? []).map((sub) => ({
      ...sub,
      parentSlug: chapter.slug,
    })),
  ]);
}

export const PRINT_MENU_SECTION_SLUGS = new Set(
  flattenPrintMenuSections().map((section) => section.slug),
);
