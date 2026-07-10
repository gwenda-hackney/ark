import type { Menu, MenuItem, MenuSection } from "../../types/menu";
import { createSanityClient } from "./client";
import { mapSanityImage, type SanityImageField } from "./images";
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

export async function fetchMenu(): Promise<Menu> {
  const client = createSanityClient();
  const docs = await client.fetch<SanityMenuSection[]>(MENU_QUERY);

  const sections = docs
    .map(mapMenuSection)
    .filter((section): section is MenuSection => section !== null);

  return { sections };
}
