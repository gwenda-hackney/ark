/**
 * ArtistRepository in memory, for tests (#186). Behaves like the others:
 * artist-repository.contract.test.js holds it to the same cases.
 */
import {
  artistNotFound,
  artistPatch,
  artistRecord,
  emailKey,
  fail,
  guestArtistPatch,
  guestArtistRecord,
} from "./artist-model.js";

const copy = (value) => structuredClone(value);

export function memoryArtistRepository({
  artists = [],
  guestArtists = [],
} = {}) {
  let artistRows = new Map();
  let guestRows = new Map();
  let nextId = 1;
  const load = (snapshot) => {
    artistRows = new Map(
      (snapshot.artists || []).map((r) => [Number(r.id), artistRecord(r)]),
    );
    guestRows = new Map(
      (snapshot.guestArtists || []).map((r) => [
        Number(r.id),
        guestArtistRecord(r),
      ]),
    );
    nextId = Math.max(0, ...artistRows.keys(), ...guestRows.keys()) + 1;
  };
  load({ artists, guestArtists });
  const byId = (map) => [...map.values()].sort((a, b) => a.id - b.id).map(copy);
  const listGuestArtists = async () => byId(guestRows);

  return {
    async listArtists() {
      return byId(artistRows);
    },
    async getArtist(id) {
      const found = artistRows.get(Number(id));
      return found ? copy(found) : null;
    },
    async createArtist(fields) {
      const record = artistRecord({ ...fields, id: nextId++ });
      artistRows.set(record.id, record);
      return copy(record);
    },
    async updateArtist(id, fields) {
      const found = artistRows.get(Number(id));
      if (!found) throw artistNotFound();
      const record = { ...found, ...artistPatch(fields) };
      artistRows.set(record.id, record);
      return copy(record);
    },
    async removeArtist(id) {
      artistRows.delete(Number(id));
    },
    listGuestArtists,
    async saveGuestArtist(email, fields) {
      const key = emailKey(email);
      if (!key)
        fail(400, "This application has no email address to keep a record by.");
      const found = [...guestRows.values()].find(
        (record) => record.email === key,
      );
      const record = found
        ? { ...found, ...guestArtistPatch(fields) }
        : guestArtistRecord({ ...fields, email: key, id: nextId++ });
      guestRows.set(record.id, record);
      return copy(record);
    },
    async exportAll() {
      return {
        artists: byId(artistRows),
        guestArtists: await listGuestArtists(),
      };
    },
    async importAll(snapshot) {
      load(copy(snapshot));
    },
  };
}
