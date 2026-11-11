import type { Menu, MenuItem, MenuKind, MenuSection } from "../types/menu";

/** The chapters of one menu: the bar or the kitchen (#240). */
export function menuChapters(menu: Menu, kind: MenuKind): MenuSection[] {
  return menu.sections.filter((section) => (section.kind ?? "bar") === kind);
}

export function flattenMenuSections(sections: MenuSection[]): MenuSection[] {
  return sections.flatMap((section) => [
    section,
    ...(section.subsections ? flattenMenuSections(section.subsections) : []),
  ]);
}

export function getSection(menu: Menu, id: string): MenuSection | undefined {
  return flattenMenuSections(menu.sections).find(
    (section) => section.id === id,
  );
}

export function getAvailableItems(section: MenuSection): MenuItem[] {
  return section.items.filter((item) => item.available !== false);
}

function isCocktail(item: MenuItem): boolean {
  const raw = String(item.drinkType || "cocktail")
    .trim()
    .toLowerCase();
  return raw === "cocktail" || raw === "";
}

/** Cocktail photos for the homepage gallery. */
export function getSignatureCocktails(
  menu: Menu,
): Array<MenuItem & { image: NonNullable<MenuItem["image"]> }> {
  return flattenMenuSections(menu.sections)
    .flatMap((section) => getAvailableItems(section))
    .filter(
      (item): item is MenuItem & { image: NonNullable<MenuItem["image"]> } =>
        isCocktail(item) && Boolean(item.image),
    );
}
