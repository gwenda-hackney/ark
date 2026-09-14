import { defineArrayMember, defineType } from "sanity";

/** Minimal rich text for event invite copy. Paragraph breaks only. */
export const eventDescription = defineType({
  name: "eventDescription",
  title: "Event description",
  type: "array",
  of: [
    defineArrayMember({
      type: "block",
      styles: [{ title: "Normal", value: "normal" }],
      lists: [],
      marks: {
        decorators: [],
        annotations: [],
      },
    }),
  ],
});
