export type ReleaseChange = "added" | "changed" | "removed";

export type ReleaseViewEntry = {
  id: string;
  type: string;
  typeLabel: string;
  label: string;
  change: ReleaseChange;
  fields: { key: string; label: string }[];
  refs: string[];
};

export type ReleaseGroup<T extends ReleaseViewEntry> = {
  type: string;
  label: string;
  entries: T[];
};

/** Keep the server's order; one group per document type. */
export function groupEntries<T extends ReleaseViewEntry>(entries: T[]): ReleaseGroup<T>[] {
  const groups: ReleaseGroup<T>[] = [];
  const byType = new Map<string, ReleaseGroup<T>>();
  for (const entry of entries) {
    let group = byType.get(entry.type);
    if (!group) {
      group = { type: entry.type, label: entry.typeLabel, entries: [] };
      byType.set(entry.type, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Search label, id and type, so an event's slug finds its series and nights. */
export function filterEntries<T extends ReleaseViewEntry>(entries: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.label, entry.id, entry.typeLabel].join(" ").toLowerCase().includes(needle),
  );
}

/**
 * What a selection also publishes: changed documents the chosen ones point at
 * (a night's series, say). Mirrors the server, which adds them anyway.
 */
export function includedWith<T extends ReleaseViewEntry>(entries: T[], chosen: Set<string>): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  const extra: T[] = [];
  const visit = (id: string) => {
    const entry = byId.get(id);
    if (!entry || entry.change === "removed" || seen.has(id)) return;
    seen.add(id);
    if (!chosen.has(id)) extra.push(entry);
    for (const ref of entry.refs) visit(ref);
  };
  for (const id of chosen) visit(id);
  return extra;
}

export function changeLabel(change: ReleaseChange): string {
  if (change === "added") return "New";
  if (change === "removed") return "Removed";
  return "Changed";
}

/** "Title, Description +2" for the collapsed row. */
export function fieldSummary(entry: ReleaseViewEntry, max = 3): string {
  if (entry.change === "removed") return "Removed from preview";
  if (entry.change === "added") return "Not on the live site yet";
  const names = entry.fields.map((field) => field.label);
  if (!names.length) return "Details differ";
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

export function countLabel(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}
