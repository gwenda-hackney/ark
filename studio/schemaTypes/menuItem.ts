import { defineField, defineType } from "sanity";
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
      title: "Cocktail type",
      type: "string",
      description: "Style or serve, e.g. Aperitif, Digestif, Long drink.",
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
      description: "Display price without £, e.g. 14",
      type: "string",
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
      title: "Signature cocktail",
      type: "boolean",
      description: "Show in the homepage image gallery (requires a photo).",
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
      media: "image",
      signature: "signature",
      notes: "notes",
      abv: "abv",
    },
    prepare({ title, subtitle, price, media, signature, notes, abv }) {
      const prefix = signature ? "★ " : "";
      return {
        title: `${prefix}${title}`,
        subtitle: [notes, abv, subtitle, price ? `£${price}` : null]
          .filter(Boolean)
          .join(" · "),
        media,
      };
    },
  },
});
