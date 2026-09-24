/**
 * Unpublished-change tracking for ops recipes vs external systems.
 *
 * Website targets (staging / production) compare the current guest projection
 * to the last successful publish snapshot stored on the Baserow item.
 *
 * POS is a stub (`unsupported`). A later live adapter should fetch external
 * records and diff against a POS-specific projection (name, prices, SKU),
 * not the guest website projection. Swap snapshot compare for live fetch
 * without changing the status model the UI already understands.
 */
import { flattenIngredientsForMenu } from "./menu.js";
import {
  digitalSectionId,
  hasDigitalPlacement,
} from "./menu-placements.js";

export const PUBLISH_SNAPSHOTS_FIELD = "Publish snapshots";

export const WEBSITE_TARGETS = ["staging", "production"];

/** Guest fields that go to Sanity. Order is the canonical hash order. */
export const WEBSITE_FIELDS = [
  "name",
  "description",
  "price",
  "priceAlt",
  "notes",
  "drinkType",
  "abv",
  "volume",
  "producer",
  "sectionId",
  "onDigitalMenu",
  "photo",
];

const OPTIONAL_SANITY_FIELDS = [
  "description",
  "price",
  "priceAlt",
  "notes",
  "abv",
  "volume",
  "producer",
];

/**
 * Target adapters. `snapshot` compares to last publish. `unsupported` hides
 * the target until an API exists. A future `live` kind would fetch records.
 */
export const TARGETS = {
  staging: {
    id: "staging",
    label: "Preview site",
    kind: "snapshot",
    projection: "website",
  },
  production: {
    id: "production",
    label: "Live website",
    kind: "snapshot",
    projection: "website",
  },
  pos: {
    id: "pos",
    label: "POS",
    kind: "unsupported",
    projection: "pos",
  },
};

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

export function guestDescription(item) {
  const written = text(item?.description);
  if (written) return written;
  const drinkType = text(item?.drinkType).toLowerCase();
  if (drinkType && drinkType !== "cocktail") return "";
  return flattenIngredientsForMenu(item?.ingredients) || "";
}

export function photoFingerprint(item) {
  return text(item?.image?.asset?.url);
}

/** Guest menus only show ABV / volume / producer on packaged (bottled) drinks. */
export function guestPackagedMeta(item) {
  const drinkType = text(item?.drinkType).toLowerCase();
  if (drinkType !== "packaged") {
    return { abv: "", volume: "", producer: "" };
  }
  return {
    abv: text(item?.abv),
    volume: text(item?.volume),
    producer: text(item?.producer),
  };
}

/** Guest-facing payload for marketing site Sanity docs. */
export function websiteProjection(item) {
  const packaged = guestPackagedMeta(item);
  const digitalSection = digitalSectionId(item);
  const onDigital =
    Array.isArray(item?.placements) && item.placements.length
      ? hasDigitalPlacement(item)
      : item?.onDigitalMenu !== false;
  return {
    name: text(item?.name),
    description: guestDescription(item),
    price: text(item?.price),
    priceAlt: text(item?.priceAlt),
    notes: text(item?.notes),
    drinkType: text(item?.drinkType) || "cocktail",
    abv: packaged.abv,
    volume: packaged.volume,
    producer: packaged.producer,
    // Baserow section row id — detects moves; Sanity ref is resolved at publish.
    sectionId: text(digitalSection || item?.sectionId || item?.section?._id),
    onDigitalMenu: onDigital,
    photo: photoFingerprint(item),
  };
}

/** Snapshots may still hold cocktail ABV/volume from before packaged-only meta. */
export function normalizeWebsitePayload(payload) {
  const next = payload && typeof payload === "object" ? { ...payload } : {};
  const packaged = guestPackagedMeta({
    drinkType: next.drinkType,
    abv: next.abv,
    volume: next.volume,
    producer: next.producer,
  });
  next.abv = packaged.abv;
  next.volume = packaged.volume;
  next.producer = packaged.producer;
  return next;
}

function canonicalValue(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "boolean") return value ? "true" : "false";
    return JSON.stringify(value ?? "");
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalValue).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(",")}}`;
}

export function projectionHash(payload) {
  return canonicalValue(payload || {});
}

export function projectionsEqual(a, b) {
  return (
    projectionHash(normalizeWebsitePayload(a)) ===
    projectionHash(normalizeWebsitePayload(b))
  );
}

export function changedFields(current, previous) {
  const left = normalizeWebsitePayload(current);
  const right = normalizeWebsitePayload(previous);
  return WEBSITE_FIELDS.filter((field) => {
    const a = left[field];
    const b = right[field];
    if (field === "onDigitalMenu") return Boolean(a) !== Boolean(b);
    return text(a) !== text(b);
  });
}

function fieldValue(payload, field) {
  if (field === "onDigitalMenu") return Boolean(payload?.[field]) ? "on" : "off";
  return text(payload?.[field]);
}

export function fieldDiffs(current, previous) {
  return changedFields(current, previous).map((field) => ({
    field,
    from: fieldValue(previous, field),
    to: fieldValue(current, field),
  }));
}

function snapshotEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const hash = typeof raw.hash === "string" ? raw.hash : "";
  const payload =
    raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
      ? raw.payload
      : {};
  const at = typeof raw.at === "string" ? raw.at : "";
  if (!hash && !at && !Object.keys(payload).length) return null;
  return { at, hash, payload };
}

export function parsePublishSnapshots(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return sanitizeSnapshots(raw);
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return sanitizeSnapshots(parsed);
  } catch {
    return {};
  }
}

function sanitizeSnapshots(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const target of [...WEBSITE_TARGETS, "pos"]) {
    const entry = snapshotEntry(parsed[target]);
    if (entry) out[target] = entry;
  }
  return out;
}

export function serializePublishSnapshots(snapshots) {
  return JSON.stringify(snapshots && typeof snapshots === "object" ? snapshots : {});
}

export function recordTargetSnapshot(snapshots, target, payload, at = new Date().toISOString()) {
  const current = snapshots && typeof snapshots === "object" ? snapshots : {};
  return {
    ...current,
    [target]: {
      at,
      hash: projectionHash(payload),
      payload,
    },
  };
}

export function sanityPatchFromProjection(payload) {
  const set = {
    name: payload.name,
    drinkType: payload.drinkType || "cocktail",
    signature: false,
  };
  const unset = ["signature"];
  for (const key of OPTIONAL_SANITY_FIELDS) {
    const value = payload[key];
    if (value) set[key] = value;
    else unset.push(key);
  }
  return { set, unset };
}

export function websiteTargetStatus(item, target) {
  const spec = TARGETS[target];
  if (!spec || spec.kind === "unsupported") {
    return { status: "unsupported" };
  }
  if (spec.kind !== "snapshot" || spec.projection !== "website") {
    return { status: "unsupported" };
  }

  const payload = websiteProjection(item);
  if (!payload.onDigitalMenu) {
    return { status: "excluded" };
  }
  if (!text(item?.sanityId)) {
    return { status: "missing" };
  }

  const snapshots =
    item?.publishSnapshots && typeof item.publishSnapshots === "object"
      ? item.publishSnapshots
      : {};
  const snap = snapshots[target];
  if (!snap?.hash) {
    // Linked to Sanity, but ops has no recorded publish yet. The drink can
    // already be on the website (seeded or published before snapshots).
    return { status: "unknown" };
  }
  if (projectionsEqual(payload, snap.payload)) {
    return { status: "published" };
  }
  return {
    status: "unpublished",
    changed: changedFields(payload, snap.payload),
    diff: fieldDiffs(payload, snap.payload),
  };
}

function compactStatus(result) {
  if (!result?.status) return { status: "unknown" };
  if (result.status === "unpublished") {
    return {
      status: "unpublished",
      changed: Array.isArray(result.changed) ? result.changed : [],
      diff: Array.isArray(result.diff) ? result.diff : [],
    };
  }
  return { status: result.status };
}

export function publicPublishStatus(item) {
  return {
    staging: compactStatus(websiteTargetStatus(item, "staging")),
    production: compactStatus(websiteTargetStatus(item, "production")),
  };
}

/** Strip snapshot JSON before sending an item to the browser. */
export function toClientItem(item) {
  if (!item || typeof item !== "object") return item;
  const { publishSnapshots: _snapshots, ...rest } = item;
  return { ...rest, publish: publicPublishStatus(item) };
}

export function toClientSection(section) {
  if (!section || typeof section !== "object") return section;
  return {
    ...section,
    items: Array.isArray(section.items) ? section.items.map(toClientItem) : [],
    subsections: toClientSections(section.subsections),
  };
}

export function toClientSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(toClientSection);
}
