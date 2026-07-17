import { randomBytes } from "node:crypto";

export function portableTextKey() {
  return randomBytes(6).toString("hex");
}

/** Portable text blocks with Sanity `_key` on blocks and spans. */
export function textToBlocks(text) {
  if (Array.isArray(text)) return ensurePortableTextKeys(text);
  return String(text)
    .split("\n\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      _type: "block",
      _key: portableTextKey(),
      style: "normal",
      markDefs: [],
      children: [
        {
          _type: "span",
          _key: portableTextKey(),
          text: paragraph,
          marks: [],
        },
      ],
    }));
}

/** Add missing `_key` values to existing portable text and channel arrays. */
export function ensurePortableTextKeys(blocks) {
  if (!Array.isArray(blocks)) return textToBlocks(blocks);
  return blocks.map((block) => {
    if (block?._type !== "block") return block;
    return {
      ...block,
      _key: block._key || portableTextKey(),
      markDefs: Array.isArray(block.markDefs) ? block.markDefs : [],
      children: (block.children ?? []).map((child) => ({
        ...child,
        _key: child._key || portableTextKey(),
      })),
    };
  });
}

export function ensureChannelKeys(channels) {
  if (!Array.isArray(channels)) return [];
  return channels.map((channel) => ({
    ...channel,
    _type: channel._type || "channel",
    _key: channel._key || portableTextKey(),
  }));
}
