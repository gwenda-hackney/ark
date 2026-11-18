import type {
  Menu,
  MenuInfo,
  MenuItem,
  MenuPrice,
  MenuSection,
} from "../../types/menu";
import type { MenuTeaseCocktail } from "../../data/menu-tease";
import { createSanityClient } from "./client";
import { getSanityImageConfig } from "./env";
import {
  mapSanityGalleryImage,
  mapSanityImage,
  type SanityImageField,
} from "./images";
import { MENU_QUERY, MENUS_QUERY } from "./queries";

type SanityMenuPrice = {
  name?: string | null;
  size?: string | null;
  price?: string | null;
};

/** Rows with a name and a price; none when the drink was published before the list. */
export function mapMenuPrices(
  rows: SanityMenuPrice[] | null | undefined,
): MenuPrice[] | undefined {
  const out: MenuPrice[] = [];
  for (const row of rows || []) {
    const name = row?.name?.trim() || "";
    const price = row?.price?.trim() || "";
    if (!name || !price) continue;
    const size = row?.size?.trim();
    out.push(size ? { name, size, price } : { name, price });
  }
  return out.length ? out : undefined;
}

type SanityMenuSection = {
  id: string | null;
  title: string;
  subtitle?: string | null;
  kind?: string | null;
  /** The pop-up kitchen's series: its slug, or "series-<slug>" when unpublished. */
  popupSeriesId?: string | null;
  menuId?: string | null;
  parentId?: string | null;
  items: Array<{
    id: string | null;
    name: string;
    description?: string | null;
    price?: string | null;
    priceAlt?: string | null;
    prices?: SanityMenuPrice[] | null;
    drinkType?: string | null;
    notes?: string | null;
    abv?: string | null;
    volume?: string | null;
    producer?: string | null;
    image?: SanityImageField;
  }>;
};

function mapDrinkType(value: string | null | undefined): MenuItem["drinkType"] {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged") return raw;
  return "cocktail";
}

function mapMenuItem(doc: SanityMenuSection["items"][number]): MenuItem | null {
  if (!doc.id || !doc.name) {
    return null;
  }

  return {
    id: doc.id,
    name: doc.name,
    description: doc.description?.trim() || undefined,
    price: doc.price?.trim() || undefined,
    priceAlt: doc.priceAlt?.trim() || undefined,
    prices: mapMenuPrices(doc.prices),
    drinkType: mapDrinkType(doc.drinkType),
    notes: doc.notes?.trim() || undefined,
    abv: doc.abv?.trim() || undefined,
    volume: doc.volume?.trim() || undefined,
    producer: doc.producer?.trim() || undefined,
    image: mapSanityImage(doc.image, doc.name),
  };
}

/** The series a chapter belongs to, by its slug: ops names the doc "series-<slug>". */
export function popupSeriesSlug(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .replace(/^drafts\./, "")
    .replace(/^series-/, "");
}

export function mapFlatSection(
  doc: SanityMenuSection,
): (MenuSection & { parentId?: string }) | null {
  if (!doc.id || !doc.title) {
    return null;
  }

  const popupSeriesId = popupSeriesSlug(doc.popupSeriesId);
  const menuId = doc.menuId?.trim() || "";

  const items = doc.items
    .map(mapMenuItem)
    .filter((item): item is MenuItem => item !== null);

  return {
    id: doc.id,
    title: doc.title,
    subtitle: doc.subtitle?.trim() || undefined,
    kind: doc.kind === "kitchen" ? "kitchen" : "bar",
    ...(popupSeriesId ? { popupSeriesId } : {}),
    ...(menuId ? { menuId } : {}),
    items,
    parentId: doc.parentId?.trim() || undefined,
  };
}

/** Nest subsections under parent chapters (print menu hierarchy). */
export function nestMenuSections(
  flat: Array<MenuSection & { parentId?: string }>,
): MenuSection[] {
  const childrenByParent = new Map<string, MenuSection[]>();

  for (const section of flat) {
    if (!section.parentId) continue;
    const list = childrenByParent.get(section.parentId) ?? [];
    const { parentId: _parentId, ...child } = section;
    list.push(child);
    childrenByParent.set(section.parentId, list);
  }

  return flat
    .filter((section) => !section.parentId)
    .map((section) => {
      const { parentId: _parentId, ...chapter } = section;
      const subsections = childrenByParent.get(section.id);
      return subsections?.length ? { ...chapter, subsections } : chapter;
    });
}

function assertMenuContent(sections: MenuSection[]) {
  if (sections.length > 0 || process.env.GITHUB_ACTIONS !== "true") {
    return;
  }

  const { dataset } = getSanityImageConfig();
  throw new Error(
    `Sanity menu is empty (dataset: ${dataset}). ` +
      "Set GitHub secret SANITY_API_TOKEN to a Viewer token (Deploy Studio cannot read documents).",
  );
}

type SanityMenu = {
  id?: string | null;
  name?: string | null;
  kind?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
  days?: string[] | null;
  popupSeriesId?: string | null;
};

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** A menu as ops sent it (#306); null without a slug or a name. */
export function mapMenuInfo(doc: SanityMenu): MenuInfo | null {
  const id = doc.id?.trim() || "";
  const name = doc.name?.trim() || "";
  if (!id || !name) return null;
  const wanted = new Set(
    (doc.days || []).map((day) => String(day).trim().toLowerCase()),
  );
  const days = WEEKDAYS.filter((day) => wanted.has(day));
  const popupSeriesId = popupSeriesSlug(doc.popupSeriesId);
  return {
    id,
    name,
    kind: doc.kind === "kitchen" ? "kitchen" : "bar",
    startsOn: doc.startsOn?.trim() || "",
    endsOn: doc.endsOn?.trim() || "",
    days: days.length === WEEKDAYS.length ? [] : days,
    ...(popupSeriesId ? { popupSeriesId } : {}),
  };
}

export async function fetchMenu(): Promise<Menu> {
  const client = createSanityClient();
  const [docs, menuDocs] = await Promise.all([
    client.fetch<SanityMenuSection[]>(MENU_QUERY),
    client.fetch<SanityMenu[]>(MENUS_QUERY),
  ]);
  const menus = (menuDocs || [])
    .map(mapMenuInfo)
    .filter((menu): menu is MenuInfo => menu !== null);

  const flat = docs
    .map(mapFlatSection)
    .filter(
      (section): section is MenuSection & { parentId?: string } =>
        section !== null,
    );

  const sections = nestMenuSections(flat);
  assertMenuContent(sections);

  return { sections, menus };
}

/** Cocktail photos for the homepage gallery — one URL per tile shape. */
export async function fetchMenuTeaseCocktails(): Promise<MenuTeaseCocktail[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityMenuSection[]>(MENU_QUERY);

  const cocktailItems = docs
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        mapDrinkType(item.drinkType) === "cocktail" && item.image?.asset?._id,
    );

  return cocktailItems
    .map((item): MenuTeaseCocktail | null => {
      if (!item.id) return null;

      const name = item.name?.trim() || "";
      const image = mapSanityGalleryImage(
        item.image,
        name || item.image?.alt || undefined,
      );

      if (!image) return null;

      return {
        id: item.id,
        name,
        description: item.description?.trim() || undefined,
        price: item.price?.trim() || undefined,
        priceAlt: item.priceAlt?.trim() || undefined,
        prices: mapMenuPrices(item.prices),
        drinkType: mapDrinkType(item.drinkType),
        notes: item.notes?.trim() || undefined,
        image,
      };
    })
    .filter((item): item is MenuTeaseCocktail => item !== null);
}
