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
  items: Array<{
    id: string | null;
    name: string;
    description?: string | null;
    price?: string | null;
    signature?: boolean | null;
    notes?: string | null;
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
    image: mapSanityImage(doc.image, doc.name),
  };
}

function mapMenuSection(doc: SanityMenuSection): MenuSection | null {
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
  };
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

  const sections = docs
    .map(mapMenuSection)
    .filter((section): section is MenuSection => section !== null);

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
