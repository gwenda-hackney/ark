/**
 * Guest artists: ops' own record of play applicants, one per email.
 * The decision (approved or declined) and the artist name and link ops uses
 * for events live here, so the website's Form Submissions (whatever schema a
 * form has) are never written by ops. Kept through the ArtistRepository
 * (shared/artists/artist-repository.js), with the wall artists.
 */
import { artistRepository } from "../../../../../shared/artists.js";
import { emailKey } from "../../../../../shared/artists/artist-model.js";

export { DECISIONS, emailKey } from "../../../../../shared/artists/artist-model.js";

/** A guest artist as forms work with it: the record, with its id as text. */
function guestArtist(record) {
  return {
    id: String(record.id ?? ""),
    email: record.email,
    decision: record.decision,
    artistName: record.artistName,
    artistLink: record.artistLink,
  };
}

/** Every record, by email. A missing table reads as none, so lists still load. */
export async function guestArtistsByEmail(env) {
  const out = new Map();
  for (const record of await artistRepository(env).listGuestArtists()) {
    if (record.email && !out.has(record.email)) out.set(record.email, guestArtist(record));
  }
  return out;
}

/** Create or update the record for `email` with the given fields. */
export async function saveGuestArtist(env, email, patch) {
  if (!emailKey(email)) {
    const error = new Error("This application has no email address to keep a record by.");
    error.status = 400;
    throw error;
  }
  return guestArtist(await artistRepository(env).saveGuestArtist(email, patch));
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
