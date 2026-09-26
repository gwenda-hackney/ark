/**
 * What a website build was made from, so ops can count changes that are in
 * the data but not yet in the built pages ("waiting for the website").
 *
 * A snapshot holds a short content fingerprint per Sanity document and per
 * artist row (artists come from the Ops Baserow DB). The deploy job captures
 * it before building and saves it to Gwenda Config after the deploy succeeds
 * (key site.build_snapshot, Service web, Env preview|production). Ops compares
 * it with the current data; anything added, changed or removed since is
 * pending. Changes made while a build runs stay pending, as they should.
 */

export const SNAPSHOT_CONFIG_KEY = "site.build_snapshot";

/**
 * Config key for one environment's snapshots. Prod keeps the plain key; the
 * dev website (built from the Gwenda Dev copy) gets its own, so the two never
 * read each other's builds.
 */
export function snapshotConfigKey(environment = "prod") {
  return environment === "dev" ? `${SNAPSHOT_CONFIG_KEY}.dev` : SNAPSHOT_CONFIG_KEY;
}

// `_originalId` marks a draft read through the preview; it is not content.
const SYSTEM_KEYS = new Set(["_rev", "_updatedAt", "_createdAt", "_originalId"]);

/** Published content only; the same filter the Website page diff uses. */
export const SNAPSHOT_DOCS_QUERY = `*[${[
  '!(_id in path("drafts.**"))',
  '!(_id in path("versions.**"))',
  '!(_id in path("_.**"))',
  '!(_id in path("system.**"))',
  '!(_type match "sanity.*")',
  '!(_type match "system.*")',
].join(" && ")}]`;

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 64-bit FNV-1a as hex: small, sync, identical in Node and Workers. */
export function fingerprint(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  const input = String(text);
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619);
    h2 = Math.imul(h2 ^ code, 16777619) ^ (h1 >>> 7);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function documentFingerprint(doc) {
  const clean = {};
  for (const [key, value] of Object.entries(doc || {})) {
    if (!SYSTEM_KEYS.has(key)) clean[key] = value;
  }
  return fingerprint(stableStringify(clean));
}

export function documentLabel(doc) {
  if (!doc) return "";
  const title = doc.title || doc.name || doc.label || doc.slug?.current || doc._id;
  if (doc._type === "event" && doc.date) return `${title} · ${doc.date}`;
  return String(title);
}

export function artistFingerprint(row) {
  const clean = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (key !== "id" && key !== "order") clean[key] = value;
  }
  return fingerprint(stableStringify(clean));
}

/** { id: [fingerprint, label, type] } for documents; { rowId: [fingerprint, name] } for artists. */
export function buildSnapshot({ docs = [], artists = [], at = new Date().toISOString(), commit = "" }) {
  const documents = {};
  for (const doc of docs) {
    if (doc?._id) documents[doc._id] = [documentFingerprint(doc), documentLabel(doc), doc._type || ""];
  }
  const artistRows = {};
  for (const row of artists) {
    if (row?.id != null) artistRows[String(row.id)] = [artistFingerprint(row), String(row.name || row.Name || row.id)];
  }
  return { version: 1, at, commit, documents, artists: artistRows };
}

export function parseSnapshot(text) {
  if (!text) return null;
  try {
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * What changed since the snapshot. Without a snapshot (never recorded) the
 * site state is unknown: `known` is false and nothing is listed.
 */
export function pendingSince(snapshot, current) {
  if (!snapshot) return { known: false, items: [] };
  const now = buildSnapshot({ docs: current.docs || [], artists: current.artists || [] });
  const items = [];
  const compare = (kind, before, after) => {
    for (const [id, entry] of Object.entries(after)) {
      const old = before[id];
      if (!old) items.push({ kind, id, change: "added", label: entry[1], type: entry[2] || kind });
      else if (old[0] !== entry[0]) {
        items.push({ kind, id, change: "changed", label: entry[1], type: entry[2] || kind });
      }
    }
    for (const [id, entry] of Object.entries(before)) {
      if (!after[id]) items.push({ kind, id, change: "removed", label: entry[1], type: entry[2] || kind });
    }
  };
  compare("document", snapshot.documents || {}, now.documents);
  compare("artist", snapshot.artists || {}, now.artists);
  return { known: true, builtAt: snapshot.at || null, items };
}

/** Order-independent signature of a pending list, to notice when it changes. */
export function pendingSignature(items) {
  return fingerprint(
    items
      .map((item) => `${item.kind}:${item.id}:${item.change}`)
      .sort()
      .join("|"),
  );
}
