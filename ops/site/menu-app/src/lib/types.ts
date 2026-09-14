export type Ingredient = {
  quantity?: string | number | null;
  unit?: string;
  name?: string;
  note?: string;
};

export type MenuItem = {
  _id?: string;
  id?: string;
  name?: string;
  sectionId?: string;
  section?: {
    _id?: string;
    _ref?: string;
    title?: string;
    parentTitle?: string;
  };
  price?: string;
  notes?: string;
  glassware?: string;
  ice?: string;
  garnish?: string;
  signature?: boolean;
  onDigitalMenu?: boolean;
  description?: string;
  lockDescription?: boolean;
  method?: string;
  abv?: string;
  volume?: string;
  producer?: string;
  ingredients?: Ingredient[];
  image?: {
    alt?: string;
    asset?: { url?: string };
  };
};

export type MenuSection = {
  _id: string;
  id?: string;
  title: string;
  slug?: string;
  orderRank?: number;
  parentId?: string | null;
  parentTitle?: string;
  items?: MenuItem[];
};

export type PublishTarget = "staging" | "production";

export const UNITS = [
  "ml",
  "cl",
  "dash",
  "barspoon",
  "drop",
  "splash",
  "each",
  "slice",
  "wedge",
  "sprig",
  "top",
  "pinch",
  "tsp",
  "tbsp",
] as const;

export const GLASSWARE = [
  "",
  "Coupe",
  "Nick & Nora",
  "Martini",
  "Rocks",
  "Highball",
  "Collins",
  "Flute",
  "Wine",
  "Mug",
  "Julep",
  "Hurricane",
] as const;

export const ICE_OPTIONS = ["", "Cubed", "Crushed", "Block", "None"] as const;
