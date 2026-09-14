type PortableTextBlock = {
  _type?: string;
  children?: Array<{ text?: string }>;
};

/** Turn Sanity portable text blocks into plain text with paragraph breaks. */
export function portableTextToPlain(value: string | PortableTextBlock[] | null | undefined): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  return value
    .map((block) => {
      if (block?._type !== "block" || !Array.isArray(block.children)) return "";
      return block.children.map((child) => child?.text ?? "").join("");
    })
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}
