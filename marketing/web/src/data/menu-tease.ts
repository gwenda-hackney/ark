import type { MenuItem } from "../types/menu";
import { getSignatureCocktails } from "./menu";

export type MenuTeaseCocktail = MenuItem & {
  image: NonNullable<MenuItem["image"]>;
};

/** Cocktail photos for the homepage gallery — from Sanity only. */
export function getMenuTeaseCocktails(
  menu: Parameters<typeof getSignatureCocktails>[0],
): MenuTeaseCocktail[] {
  return getSignatureCocktails(menu);
}

export function hasLiveMenuCocktails(
  menu: Parameters<typeof getSignatureCocktails>[0],
): boolean {
  return getSignatureCocktails(menu).length > 0;
}
