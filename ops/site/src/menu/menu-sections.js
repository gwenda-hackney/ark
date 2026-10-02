/**
 * Print-shaped menu tree: chapters with optional subsections.
 * Baserow stores a flat table plus Parent; this is the nested model the app uses.
 */

/**
 * @template {{ subsections?: T[] }} T
 * @param {T[] | null | undefined} sections
 * @returns {T[]}
 */
export function flattenMenuSections(sections) {
  return (sections || []).flatMap((section) => [
    section,
    ...flattenMenuSections(section.subsections || []),
  ]);
}

export function nestMenuSections(flat) {
  const list = (flat || []).map((section) => ({
    ...section,
    subsections: [],
  }));
  const byId = new Map(list.map((section) => [String(section._id), section]));
  const roots = [];
  for (const section of list) {
    const parentId = section.parentId != null ? String(section.parentId) : "";
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).subsections.push(section);
    } else {
      roots.push(section);
    }
  }
  sortSectionTree(roots);
  return roots;
}

export function sortSectionTree(nodes) {
  (nodes || []).sort(
    (a, b) => (a.orderRank ?? 0) - (b.orderRank ?? 0) || String(a.title || "").localeCompare(String(b.title || "")),
  );
  for (const node of nodes || []) {
    sortSectionTree(node.subsections);
  }
}

export function sectionPathLabel(section) {
  const title = String(section?.title || "").trim() || "Untitled";
  const parent = String(section?.parentTitle || "").trim();
  return parent ? `${parent} / ${title}` : title;
}

export function countSectionItems(section) {
  const own = Array.isArray(section?.items) ? section.items.length : 0;
  const nested = (section?.subsections || []).reduce(
    (sum, child) => sum + countSectionItems(child),
    0,
  );
  return own + nested;
}

function itemRowId(row) {
  return String(row?._id || row?.id || "");
}

export function removeItemFromSections(sections, itemId) {
  const id = String(itemId || "");
  return (sections || []).map((section) => ({
    ...section,
    items: (section.items || []).filter((row) => itemRowId(row) !== id),
    subsections: removeItemFromSections(section.subsections, id),
  }));
}

export function upsertItemInSections(sections, item) {
  const itemId = itemRowId(item);
  if (!itemId) return sections || [];
  const sectionId = String(
    item.sectionId || item.section?._id || item.section?._ref || "",
  );
  const without = removeItemFromSections(sections, itemId);
  if (!sectionId) return without;

  const insert = (nodes) =>
    (nodes || []).map((section) => {
      const subsections = insert(section.subsections);
      if (String(section._id) !== sectionId) {
        return { ...section, subsections };
      }
      const items = [
        ...(section.items || []).filter((row) => itemRowId(row) !== itemId),
        item,
      ];
      items.sort(
        (a, b) =>
          (a.orderRank ?? 0) - (b.orderRank ?? 0) ||
          String(a.name || "").localeCompare(String(b.name || ""), undefined, {
            sensitivity: "base",
          }),
      );
      return { ...section, items, subsections };
    });

  return insert(without);
}
