import type { Menu, MenuItem, MenuSection } from "../../types/menu";
import type { MenuTeaseCocktail } from "../../data/menu-tease";
import { createSanityClient } from "./client";
import { getSanityImageConfig } from "./env";
import { mapSanityGalleryImage, mapSanityImage, type SanityImageField } from "./images";
import { MENU_QUERY } from "./queries";

type SanityMenuSection = {
  id: string | null;
  title: string;
  subtitle?: string | null;
  parentId?: string | null;
  items: Array<{
    id: string | null;
    name: string;
    description?: string | null;
    price?: string | null;
    signature?: boolean | null;
    notes?: string | null;
    abv?: string | null;
    volume?: string | null;
    producer?: string | null;
    image?: SanityImageField;
  }>;
};

function mapMenuItem(doc: SanityMenuSection["items"][number]): MenuItem | null {
  if (!doc.id || !doc.name) {
    return null;
  }

  return {
    id: doc.id,
    name: doc.name,
    description: doc.description?.trim() || undefined,
    price: doc.price?.trim() || undefined,
    signature: doc.signature === true,
    notes: doc.notes?.trim() || undefined,
    abv: doc.abv?.trim() || undefined,
    volume: doc.volume?.trim() || undefined,
    producer: doc.producer?.trim() || undefined,
    image: mapSanityImage(doc.image, doc.name),
  };
}

function mapFlatSection(doc: SanityMenuSection): (MenuSection & { parentId?: string }) | null {
  if (!doc.id || !doc.title) {
    return null;
  }

  const items = doc.items
    .map(mapMenuItem)
    .filter((item): item is MenuItem => item !== null);

  return {
    id: doc.id,
    title: doc.title,
    subtitle: doc.subtitle?.trim() || undefined,
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

export async function fetchMenu(): Promise<Menu> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityMenuSection[]>(MENU_QUERY);

  const flat = docs
    .map(mapFlatSection)
    .filter((section): section is MenuSection & { parentId?: string } => section !== null);

  const sections = nestMenuSections(flat);
  assertMenuContent(sections);

  return { sections };
}

/** Signature cocktails for the homepage gallery — one URL per tile shape. */
export async function fetchMenuTeaseCocktails(): Promise<MenuTeaseCocktail[]> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityMenuSection[]>(MENU_QUERY);

  const signatureItems = docs
    .flatMap((section) => section.items)
    .filter((item) => item.signature === true && item.image?.asset?._id);

  return signatureItems
    .map((item): MenuTeaseCocktail | null => {
      if (!item.id || !item.name) return null;

      const image = mapSanityGalleryImage(item.image, item.name);

      if (!image) return null;

      return {
        id: item.id,
        name: item.name,
        description: item.description?.trim() || undefined,
        price: item.price?.trim() || undefined,
        signature: true,
        notes: item.notes?.trim() || undefined,
        image,
      };
    })
    .filter((item): item is MenuTeaseCocktail => item !== null);
}
