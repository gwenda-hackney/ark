import type { MenuItem } from "./types";

export type PublishTarget = "preview" | "production";
export type PublishStatus =
  | "excluded"
  | "missing"
  | "unknown"
  | "unpublished"
  | "published";
export type PublishDiff = {
  field: string;
  from?: string;
  to?: string;
};
export type TargetPublishState = {
  status: PublishStatus;
  changed?: string[];
  diff?: PublishDiff[];
};
export type ItemPublishState = {
  preview?: TargetPublishState;
  production?: TargetPublishState;
};
const PUBLISH_FIELD_LABELS: Record<string, string> = {
  name: "name",
  description: "description",
  price: "price",
  priceAlt: "alt price",
  prices: "prices",
  notes: "tasting note",
  drinkType: "kind",
  abv: "ABV",
  volume: "volume",
  producer: "producer",
  sectionId: "section",
  onDigitalMenu: "visibility",
  photo: "photo",
};
export function publishFieldLabel(field: string): string {
  return PUBLISH_FIELD_LABELS[field] || field;
}
export function formatChangedFields(changed?: string[]): string {
  return (changed || []).map(publishFieldLabel).join(", ");
}
export function formatDiffValue(value?: string): string {
  const text = String(value || "").trim();
  return text || "blank";
}
export function formatPublishDiff(diff: PublishDiff): string {
  if (diff.field === "photo") return "photo updated";
  return `${formatDiffValue(diff.from)} to ${formatDiffValue(diff.to)}`;
}
/** True when this drink has unpublished field changes or is not on the site yet. */
export function targetNeedsSync(state: TargetPublishState | undefined): boolean {
  return state?.status === "unpublished" || state?.status === "missing";
}
export function publishNeedsSync(publish?: ItemPublishState): boolean {
  return targetNeedsSync(publish?.preview) || targetNeedsSync(publish?.production);
}
/** True when the live website is missing this drink or is behind ops. */
export function publishNotLive(publish?: ItemPublishState): boolean {
  return targetNeedsSync(publish?.production);
}
export function publishChangeCount(publish?: ItemPublishState): number {
  return new Set([
    ...(publish?.preview?.changed || []),
    ...(publish?.production?.changed || []),
  ]).size;
}
export function publishPendingCount(
  items: MenuItem[],
  target?: PublishTarget,
): number {
  return items.filter((item) => {
    if (target) return targetNeedsSync(item.publish?.[target]);
    return publishNeedsSync(item.publish);
  }).length;
}
export function publishTargetPhrase(
  state: TargetPublishState | undefined,
): string {
  switch (state?.status) {
    case "published":
      return "up to date";
    case "unpublished": {
      const fields = formatChangedFields(state.changed);
      return fields ? `unpublished (${fields})` : "unpublished changes";
    }
    case "unknown":
      return "no recorded snapshot yet";
    case "missing":
      return "not on the website yet";
    case "excluded":
      return "not on the digital menu";
    default:
      return "no recorded snapshot yet";
  }
}
export function publishHint(publish?: ItemPublishState): string {
  return `Preview site: ${publishTargetPhrase(publish?.preview)}. Live website: ${publishTargetPhrase(publish?.production)}.`;
}
export function publishSyncLabel(publish?: ItemPublishState): string {
  if (!publishNeedsSync(publish)) return "Up to date";
  const count = publishChangeCount(publish);
  if (count === 1) return "1 unpublished change";
  if (count > 1) return `${count} unpublished changes`;
  return "Needs a website update";
}
export function publishLiveLabel(publish?: ItemPublishState): string {
  const live = publish?.production;
  if (!targetNeedsSync(live)) return "Live on the website";
  if (live?.status === "missing") return "Not on the live website";
  const fields = formatChangedFields(live?.changed);
  return fields
    ? `Not live · ${fields}`
    : "Not live · unpublished changes";
}
export type PublishGroupItem = {
  name: string;
  changed?: string[];
  diff?: PublishDiff[];
};
export type PublishGroups = {
  unpublished: PublishGroupItem[];
  missing: PublishGroupItem[];
  unknown: PublishGroupItem[];
  published: PublishGroupItem[];
  excluded: PublishGroupItem[];
};
export function groupItemsForPublish(
  items: MenuItem[],
  target: PublishTarget,
): PublishGroups {
  const groups: PublishGroups = {
    unpublished: [],
    missing: [],
    unknown: [],
    published: [],
    excluded: [],
  };
  for (const item of items) {
    const name = item.name?.trim() || "Untitled";
    const state = item.publish?.[target];
    const status = state?.status || "unknown";
    if (status === "unpublished") {
      groups.unpublished.push({
        name,
        changed: state?.changed,
        diff: state?.diff,
      });
    } else if (status === "missing") {
      groups.missing.push({ name });
    } else if (status === "unknown") {
      groups.unknown.push({ name });
    } else if (status === "published") {
      groups.published.push({ name });
    } else if (status === "excluded") {
      groups.excluded.push({ name });
    } else {
      groups.unknown.push({ name });
    }
  }
  return groups;
}
