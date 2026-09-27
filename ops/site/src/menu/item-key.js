/**
 * Human URL key for menu drinks and inventory items.
 * Names are unique (case-insensitive, and after slugify).
 */

export const RESERVED_ITEM_SLUGS = new Set(["new"]);

export function itemSlug(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function namesClash(a, b) {
  const left = String(a || "").trim();
  const right = String(b || "").trim();
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const leftSlug = itemSlug(left);
  const rightSlug = itemSlug(right);
  return Boolean(leftSlug && rightSlug && leftSlug === rightSlug);
}

export function assertItemKey(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const slug = itemSlug(trimmed);
  if (!slug) {
    const error = new Error(
      "Use letters or numbers in the name so it can be a link.",
    );
    error.status = 400;
    throw error;
  }
  if (RESERVED_ITEM_SLUGS.has(slug)) {
    const error = new Error("That name is reserved. Choose another.");
    error.status = 400;
    throw error;
  }
  return { name: trimmed, slug };
}

export function findNameClash(entries, name, { exceptId } = {}) {
  assertItemKey(name);
  const except = exceptId != null && exceptId !== "" ? String(exceptId) : "";
  return (
    (entries || []).find((entry) => {
      const id = String(entry?.id ?? entry?._id ?? "");
      if (except && id === except) return false;
      return namesClash(entry?.name, name);
    }) || null
  );
}

export function assertUniqueItemName(
  entries,
  name,
  { exceptId, kind = "item" } = {},
) {
  assertItemKey(name);
  if (!findNameClash(entries, name, { exceptId })) return;
  const error = new Error(
    kind === "drink"
      ? "A drink with that name already exists."
      : "An inventory item with that name already exists.",
  );
  error.status = 409;
  throw error;
}

/** Match a route key: slug of the name, or a leftover numeric Baserow id. */
export function itemMatchesKey(item, key) {
  const raw = String(key || "").trim();
  if (!raw || !item) return false;
  const name = String(item.name || "").trim();
  if (name && (itemSlug(name) === itemSlug(raw) || namesClash(name, raw))) {
    return true;
  }
  if (/^\d+$/.test(raw)) {
    return String(item._id || item.id || "") === raw;
  }
  return false;
}
