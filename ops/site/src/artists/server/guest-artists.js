/**
 * Guest artists: ops' own record of play applicants, one row per email.
 * The decision (approved or declined) and the artist name and link ops uses
 * for events live here, so the website's Form Submissions (whatever schema a
 * form has) are never written by ops.
 */
import {
  TABLE_GUEST_ARTISTS,
  createRow,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../platform/baserow.js";

export const DECISIONS = ["Approved", "Declined"];

/** Columns besides the primary "Email" (migration and setup both use these). */
export const GUEST_ARTIST_FIELDS = [
  {
    name: "Decision",
    type: "single_select",
    select_options: [
      { value: "Approved", color: "green" },
      { value: "Declined", color: "red" },
    ],
  },
  { name: "Artist name", type: "text" },
  { name: "Artist link", type: "url" },
];

function text(value) {
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) return String(value.value).trim();
  return String(value).trim();
}

export function emailKey(value) {
  return text(value).toLowerCase();
}

export function mapGuestArtist(row) {
  return {
    id: String(row?.id ?? ""),
    email: emailKey(row?.Email),
    decision: text(row?.Decision),
    artistName: text(row?.["Artist name"]),
    artistLink: text(row?.["Artist link"]),
  };
}

async function tableId(env) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.guestArtists) {
    const error = new Error(
      `Baserow table "${TABLE_GUEST_ARTISTS}" was not found. Run the deploy migrations.`,
    );
    error.status = 503;
    throw error;
  }
  return tables.guestArtists;
}

/** Every record, by email. A missing table reads as none, so lists still load. */
export async function guestArtistsByEmail(env) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.guestArtists) return new Map();
  const rows = await listAllRows(env, tables.guestArtists);
  const out = new Map();
  for (const row of rows.map(mapGuestArtist)) {
    if (row.email && !out.has(row.email)) out.set(row.email, row);
  }
  return out;
}

/** Create or update the record for `email` with the given fields. */
export async function saveGuestArtist(env, email, patch) {
  const key = emailKey(email);
  if (!key) {
    const error = new Error("This application has no email address to keep a record by.");
    error.status = 400;
    throw error;
  }
  const id = await tableId(env);
  const fields = {};
  if (patch.decision !== undefined) fields.Decision = patch.decision || null;
  if (patch.artistName !== undefined) fields["Artist name"] = patch.artistName;
  if (patch.artistLink !== undefined) fields["Artist link"] = patch.artistLink;
  const existing = (await guestArtistsByEmail(env)).get(key);
  const row = existing
    ? await updateRow(env, id, existing.id, fields)
    : await createRow(env, id, { Email: key, ...fields });
  return mapGuestArtist(row);
}

function same(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/**
 * Carry an artist's new name or link to upcoming events that still show the
 * old ones. A series is changed when its guest is the old artist and it has
 * nights ahead; an upcoming night when its guest (own or the series') is the
 * old artist. Anything edited to something else is left alone. Pure.
 * @returns {{ series: { id: string, patch: { artist: string, pageUrl: string } }[],
 *   nights: { eventId: string, rows: object[] }[] }}
 */
export function planArtistUpdate(events, { from, to }, today) {
  const plan = { series: [], nights: [] };
  if (!from?.name || (same(from.name, to.name) && from.link === to.link)) return plan;
  const isOld = (name, link) => same(name, from.name) && String(link || "") === String(from.link || "");
  for (const event of events || []) {
    const upcoming = (event.dates || []).filter((row) => row.date >= today && row.id);
    if (!upcoming.length) continue;
    const seriesMatches = isOld(event.artist, event.pageUrl);
    if (seriesMatches) plan.series.push({ id: String(event.id), patch: { artist: to.name, pageUrl: to.link } });
    const seriesArtist = seriesMatches ? to.name : event.artist || "";
    const seriesLink = seriesMatches ? to.link : event.pageUrl || "";
    const rows = [];
    for (const row of upcoming) {
      const own = row.overrides || {};
      if (!isOld(own.artist || event.artist, own.pageUrl || event.pageUrl)) continue;
      // What the night must hold so it shows the new artist: nothing where the series does.
      const artist = same(to.name, seriesArtist) ? "" : to.name;
      const pageUrl = to.link === seriesLink ? "" : to.link;
      if ((own.artist || "") === artist && (own.pageUrl || "") === pageUrl) continue;
      rows.push({ ...row, overrides: { ...own, artist, pageUrl } });
    }
    if (rows.length) plan.nights.push({ eventId: String(event.id), rows });
  }
  return plan;
}
