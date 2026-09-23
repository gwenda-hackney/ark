/** Turn Sanity portable text blocks into plain text with paragraph breaks. */
export function portableTextToPlain(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";

  return value
    .map((block) => {
      if (block?._type !== "block" || !Array.isArray(block.children)) return "";
      const text = block.children.map((child) => child?.text ?? "").join("");
      if (block.listItem === "bullet") return `• ${text}`;
      if (block.listItem === "number") return `1. ${text}`;
      return text;
    })
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
}
