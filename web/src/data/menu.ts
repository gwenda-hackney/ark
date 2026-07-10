import type { Menu } from "../types/menu";
import cocktail1 from "../assets/images/cocktails/cocktail1.png";
import cocktail2 from "../assets/images/cocktails/cocktail2.png";
import cocktail3 from "../assets/images/cocktails/cocktail3.png";
import cocktail4 from "../assets/images/cocktails/cocktail4.png";
import cocktail5 from "../assets/images/cocktails/coctail5.png";
import cocktail6 from "../assets/images/cocktails/cocktail6.png";

/**
 * Single source of truth for all menu content.
 * Swap this module for a Google Sheet or CMS fetch when non-devs need to edit.
 */
export const menu: Menu = {
  sections: [
    {
      id: "cocktails",
      title: "Cocktails",
      subtitle: "Handcrafted with premium spirits and fresh ingredients",
      items: [
        {
          id: "wick-lantern-sour",
          name: "Wick Lantern Sour",
          description: "Bourbon, lemon, honey, aromatic bitters",
          price: "14",
          tags: ["signature"],
          image: cocktail1,
        },
        {
          id: "canal-bloom-old-fashioned",
          name: "Canal Bloom Old Fashioned",
          description: "Rye, demerara, orange blossom, cedar smoke",
          price: "15",
          tags: ["signature"],
          image: cocktail2,
        },
        {
          id: "vicolo-gold",
          name: "Vicolo Gold",
          description: "Gin, vermouth, saffron, honey",
          price: "14",
          image: cocktail3,
        },
        {
          id: "notte-rossa-spritz",
          name: "Notte Rossa Spritz",
          description: "Bitter aperitivo, prosecco, blood orange",
          price: "12",
          image: cocktail4,
        },
        {
          id: "laguna-ember",
          name: "Laguna Ember",
          description: "Mezcal, amaro, grapefruit, chilli",
          price: "14",
          image: cocktail5,
        },
        {
          id: "wick-afterglow",
          name: "Wick Afterglow",
          description: "Rum, passion fruit, vanilla, lime",
          price: "13",
          image: cocktail6,
        },
      ],
    },
    {
      id: "wines",
      title: "Natural Wines",
      subtitle: "A rotating selection from small European producers",
      items: [
        {
          id: "wine-glass",
          name: "By the Glass",
          description: "Ask your server — changes weekly",
        },
        {
          id: "wine-bottle",
          name: "Bottles",
          description: "Curated list of reds, whites, and skin-contact",
        },
      ],
    },
    {
      id: "small-plates",
      title: "Small Plates",
      subtitle: "Italian-inspired bites to share",
      items: [
        {
          id: "plate-placeholder-1",
          name: "Seasonal Antipasti",
          description: "Chef's selection — changes with the market",
        },
        {
          id: "plate-placeholder-2",
          name: "House Olives & Focaccia",
          description: "Sicilian olives, rosemary oil, warm bread",
          price: "8",
        },
      ],
    },
  ],
};

/** Helpers for components — keep rendering logic out of data files */

export function getSection(id: string) {
  return menu.sections.find((s) => s.id === id);
}

export function getCocktailsWithImages() {
  const cocktails = getSection("cocktails");
  return cocktails?.items.filter((item) => item.image) ?? [];
}

export function getAvailableItems(section: Menu["sections"][number]) {
  return section.items.filter((item) => item.available !== false);
}
