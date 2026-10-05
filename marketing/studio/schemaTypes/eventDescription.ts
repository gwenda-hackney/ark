import { defineArrayMember, defineType } from "sanity";

/** Links the website shows: web, email, phone, or a page on the site (#33). */
function validHref(value: unknown): true | string {
  const href = String(value ?? "").trim();
  if (!href) return "Add the link's address.";
  if (/^\/(?!\/)/.test(href)) return true;
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(href)) return true;
  return "Use https://…, mailto:, tel: or a page on the site (/…).";
}

/**
 * Event invite copy (#33): paragraphs with line breaks, bold, italic, links
 * and bullet lists. Ops writes it; the website renders the same set.
 */
export const eventDescription = defineType({
  name: "eventDescription",
  title: "Event description",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: [{ title: "Normal", value: "normal" }],
      lists: [{ title: "Bullet", value: "bullet" }],
      marks: {
        decorators: [
          { title: "Bold", value: "strong" },
          { title: "Italic", value: "em" },
        ],
        annotations: [
          {
            name: "link",
            type: "object",
            title: "Link",
            fields: [
              {
                name: "href",
                type: "string",
                title: "Address",
                validation: (rule) => rule.custom(validHref),
              },
            ],
          },
        ],
      },
    }),
  ],
});
