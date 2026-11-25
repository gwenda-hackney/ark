/**
 * The featured artist is closed to new entries (#313): the website stopped
 * showing one in the rebrand (#240). Past artists stay on Artists → Featured
 * artist, to look up and open.
 *
 * This is the one switch. While it holds a reason:
 * - Add artist stays in place, disabled, with the reason (addArtistAction);
 * - /artists/new lands back on the list (app/spa-path.js canonicalizePath);
 * - the dashboard doesn't warn that the artist ends with nobody next
 *   (home/dashboard.ts featuredArtistEnding).
 * Set it to "" to open it again: all three come back.
 */
export const FEATURED_ARTIST_CLOSED = "Not on the website";

/**
 * Add artist: off with the switch's reason while it's closed (ui/action-state.ts).
 * @param {string} [closed]
 * @returns {import("../ui/action-state").ActionState}
 */
export function addArtistAction(closed = FEATURED_ARTIST_CLOSED) {
  return closed ? { disabled: true, reason: closed } : { disabled: false };
}

/**
 * Where a new-artist address goes: back to the list while it's closed.
 * @param {string} path a shell path without its query
 * @param {string} [closed]
 * @returns {string | null} the list's address, or null to stay
 */
export function closedArtistRedirect(path, closed = FEATURED_ARTIST_CLOSED) {
  if (!closed) return null;
  // The Featured artist page is gone from ops too: its addresses open Enquiries.
  return path === "/artists" || path.startsWith("/artists/") ? "/forms" : null;
}
