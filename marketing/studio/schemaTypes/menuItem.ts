import { defineArrayMember, defineField, defineType } from "sanity";
import { orderRankField, orderRankOrdering } from "@sanity/orderable-document-list";

export const menuItem = defineType({
  name: "menuItem",
  title: "Menu item",
  type: "document",
  orderings: [orderRankOrdering],
  fields: [
    orderRankField({ type: "menuItem" }),
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
      description: "Ingredient list or tasting notes shown on the menu.",
    }),
    defineField({
      name: "notes",
      title: "Tasting note",
      type: "string",
      description: "Optional guest line, e.g. Floral fizz, Digestif.",
    }),
    defineField({
      name: "drinkType",
      title: "Drink type",
      type: "string",
      options: {
        list: [
          { title: "Cocktail", value: "cocktail" },
          { title: "Pour", value: "pour" },
          { title: "Beer", value: "beer" },
          { title: "Packaged", value: "packaged" },
        ],
        layout: "radio",
      },
      initialValue: "cocktail",
    }),
    defineField({
      name: "section",
      title: "Section",
      type: "reference",
      to: [{ type: "menuSection" }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "price",
      title: "Price",
      description: "Primary price without £ (single, pint, or unit).",
      type: "string",
    }),
    defineField({
      name: "priceAlt",
      title: "Alt price",
      description: "Second size without £ (double or half pint).",
      type: "string",
    }),
    defineField({
      name: "prices",
      title: "Prices",
      description:
        "Every size and its price, main one first. Set in ops; Price and Alt price are the first two.",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "menuPrice",
          title: "Price",
          fields: [
            defineField({
              name: "name",
              title: "Name",
              type: "string",
              description: "e.g. Single, Pint, 175 ml, Bottle.",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "size",
              title: "Size",
              type: "string",
              description: "Optional, with its unit, e.g. 25 ml.",
            }),
            defineField({
              name: "price",
              title: "Price",
              type: "string",
              description: "Without £.",
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: { name: "name", size: "size", price: "price" },
            prepare({ name, size, price }) {
              return {
                title: [name, price ? `£${price}` : null].filter(Boolean).join(" · "),
                subtitle: size,
              };
            },
          },
        }),
      ],
    }),
    defineField({
      name: "image",
      title: "Photo",
      type: "image",
      description:
        "Homepage gallery: drag the crop handles to frame the drink, then drag the hotspot circle onto the glass — it stays in view when tiles trim the edges.",
      options: { hotspot: true },
      fields: [
        defineField({
          name: "alt",
          title: "Alt text",
          type: "string",
          description: "Describe the drink for screen readers. Defaults to the cocktail name.",
        }),
      ],
    }),
    defineField({
      name: "signature",
      title: "Signature cocktail (legacy)",
      type: "boolean",
      description: "Deprecated. Gallery uses cocktail photos instead.",
      hidden: true,
      initialValue: false,
    }),
    defineField({
      name: "abv",
      title: "ABV",
      type: "string",
      description: "Optional. For beer/wine e.g. 4.8% or 0.0%.",
    }),
    defineField({
      name: "volume",
      title: "Volume",
      type: "string",
      description: "Optional serve size e.g. 33cl.",
    }),
    defineField({
      name: "producer",
      title: "Producer / brand",
      type: "string",
      description: "Optional. Brewery or house for bottled drinks.",
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "section.title",
      price: "price",
      priceAlt: "priceAlt",
      drinkType: "drinkType",
      media: "image",
      notes: "notes",
      abv: "abv",
    },
    prepare({ title, subtitle, price, priceAlt, drinkType, media, notes, abv }) {
      const priceLine =
        price && priceAlt ? `£${price} / £${priceAlt}` : price ? `£${price}` : null;
      return {
        title,
        subtitle: [drinkType, notes, abv, subtitle, priceLine]
          .filter(Boolean)
          .join(" · "),
        media,
      };
    },
  },
});
