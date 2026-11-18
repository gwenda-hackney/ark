/**
 * Taking an item off one menu: the rule the menu's page uses for one item
 * and the server uses for every item in a section it removes, so both agree.
 */

/**
 * Taking an item off this menu (its sections `here`): its print and website
 * places on it go, the rest stay. `delete` when that leaves it on no menu at
 * all, so the owner is asked to delete it instead.
 *
 * @template {{ sectionId?: string | null; placements?: { channel: string; sectionId?: string | null }[] }} T
 * @param {T} item
 * @param {Iterable<string>} here
 * @returns {{ action: "delete" } | { action: "update"; item: T }}
 */
export function offMenu(item, here) {
  const sections = new Set([...here].map(String));
  const placements = item.placements || [];
  const guestElsewhere = placements.filter(
    (row) => row.channel !== "pos" && row.sectionId && !sections.has(String(row.sectionId)),
  );
  const ownElsewhere = Boolean(item.sectionId) && !sections.has(String(item.sectionId));
  if (!guestElsewhere.length && !ownElsewhere) return { action: "delete" };
  return {
    action: "update",
    item: {
      ...item,
      sectionId: ownElsewhere ? item.sectionId : String(guestElsewhere[0].sectionId),
      placements: placements.filter((row) => row.channel === "pos" || !sections.has(String(row.sectionId))),
    },
  };
}
