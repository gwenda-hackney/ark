import { defineArrayMember, defineField, defineType } from "sanity";

const FIELD_TYPES = [
  { title: "Short text", value: "text" },
  { title: "Email", value: "email" },
  { title: "Phone", value: "tel" },
  { title: "URL / link", value: "url" },
  { title: "Long text", value: "textarea" },
  { title: "Single choice", value: "select" },
  { title: "Multiple choice", value: "multiSelect" },
  // The choices are the series ops marks Taking applications (#41).
  { title: "Series taking applications", value: "seriesChoice" },
] as const;

export const formField = defineType({
  name: "formField",
  title: "Form field",
  type: "object",
  fields: [
    defineField({
      name: "key",
      title: "Field key",
      type: "string",
      description:
        "Stable machine name used in submissions (e.g. artistName). Do not rename after go-live.",
      validation: (rule) =>
        rule
          .required()
          .regex(/^[a-z][a-zA-Z0-9]*$/, {
            name: "camelCase",
            invert: false,
          })
          .error("Use camelCase starting with a letter (e.g. musicStyle)."),
    }),
    defineField({
      name: "label",
      title: "Label",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "section",
      title: "Section",
      type: "string",
      description:
        "Groups fields under a heading on the page (e.g. About you). Same label = same section.",
    }),
    defineField({
      name: "type",
      title: "Type",
      type: "string",
      options: { list: [...FIELD_TYPES], layout: "radio" },
      initialValue: "text",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "placeholder",
      title: "Placeholder",
      type: "string",
    }),
    defineField({
      name: "helpText",
      title: "Help text",
      type: "string",
      description: "Short hint under the field.",
    }),
    defineField({
      name: "required",
      title: "Required",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "options",
      title: "Choices",
      type: "array",
      hidden: ({ parent }) =>
        parent?.type !== "select" && parent?.type !== "multiSelect",
      of: [
        defineArrayMember({
          type: "object",
          name: "option",
          fields: [
            defineField({
              name: "label",
              title: "Label",
              type: "string",
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: "value",
              title: "Value",
              type: "string",
              description: "Stored value. Defaults to the label if empty.",
            }),
          ],
          preview: {
            select: { title: "label", subtitle: "value" },
          },
        }),
      ],
      validation: (rule) =>
        rule.custom((options, context) => {
          const parent = context.parent as { type?: string } | undefined;
          if (parent?.type !== "select" && parent?.type !== "multiSelect") {
            return true;
          }
          if (!options || options.length === 0) {
            return "Add at least one choice for this field type.";
          }
          return true;
        }),
    }),
  ],
  preview: {
    select: {
      title: "label",
      subtitle: "type",
      required: "required",
      key: "key",
    },
    prepare({ title, subtitle, required, key }) {
      const req = required ? " · required" : "";
      return {
        title: title || key || "Field",
        subtitle: `${subtitle || "text"}${req}${key ? ` · ${key}` : ""}`,
      };
    },
  },
});
