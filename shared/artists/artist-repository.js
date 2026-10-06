/**
 * ArtistRepository (#186): the only way ops and the website read or write
 * wall artists and guest artists. It speaks in records (artist-model.js),
 * never in tables or columns. Every adapter implements all of it, and
 * ops/site/src/artists/server/artist-repository.contract.test.js holds them
 * to the same behaviour:
 *
 *   listArtists()                ArtistRecord[], by id; rows with no slot included
 *   getArtist(id)                ArtistRecord, or null when missing
 *   createArtist(fields)         ArtistRecord
 *   updateArtist(id, fields)     ArtistRecord; only the given fields change
 *                                (photos too: portrait, art, gwenda). 404 when missing
 *   removeArtist(id)             a missing artist is fine
 *   listGuestArtists()           GuestArtistRecord[], by id, one per email
 *   saveGuestArtist(email, fields)  GuestArtistRecord: creates the one for that
 *                                email, or changes only the given fields
 *   exportAll()                  { artists, guestArtists }, for data-move (#127)
 *   importAll(snapshot)          memory and D1: replace everything, keeping ids
 *
 * Rules (one current and one next, checks on input, photos waiting for the
 * backfill) live in ops' artist-store.js. Baserow until `store:artists` in
 * ops D1 says d1 (shared/data-store.js). The website reads it too: through
 * its OPS_DB binding at runtime, over the D1 API in the build.
 */
import { databaseFor } from "../d1-env.js";
import { switchedRepository } from "../data-store.js";
import { baserowArtistRepository } from "./baserow-artists.js";
import { d1ArtistRepository } from "./d1-artists.js";

/** The repository for this runtime. Tests may hand one in as env.artistRepository. */
export function artistRepository(env) {
  return (
    env?.artistRepository ||
    switchedRepository(env, "artists", {
      baserow: (env) => baserowArtistRepository(env),
      d1: (env) => d1ArtistRepository(databaseFor(env, "ops")),
    })
  );
}
