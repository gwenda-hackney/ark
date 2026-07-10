import type { Menu, MenuItem, MenuSection } from "../types/menu";

export function getSection(menu: Menu, id: string): MenuSection | undefined {
  return menu.sections.find((section) => section.id === id);
}

export function getAvailableItems(section: MenuSection): MenuItem[] {
  return section.items.filter((item) => item.available !== false);
}

/** Signature cocktails with CMS photos — homepage gallery source. */
export function getSignatureCocktails(menu: Menu): Array<MenuItem & { image: NonNullable<MenuItem["image"]> }> {
  return menu.sections
    .flatMap((section) => getAvailableItems(section))
    .filter(
      (item): item is MenuItem & { image: NonNullable<MenuItem["image"]> } =>
        item.signature === true && Boolean(item.image),
    );
}
