/**
 * VenueRepository in memory (#240): for tests, and the reference for what
 * every adapter must do (venue-repository.contract.test.js).
 */
import { galleryPhoto } from "../../gallery-model.js";
import { DAYS, openingDay } from "../../hours-model.js";
import { partyFacts } from "../../parties-model.js";

/**
 * @typedef {import("../../gallery-model.js").GalleryPhoto & { id: number, position: number }} GalleryRow
 */

export function memoryVenueRepository({ openingHours = null, parties = null, gallery = [] } = {}) {
  /** @type {{ id: number, day: string, closed: boolean, opens: string, closes: string, updatedAt: string, updatedBy: string }[]} */
  let hours = [];
  /**
   * The party facts are one row (id 1); none until first saved.
   * @type {{ id: number, standing: number | null, seated: number | null, included: string, replyWithin: string, updatedAt: string, updatedBy: string }[]}
   */
  let partyRows = [];
  /** The gallery's rows, by id; `position` orders them. @type {GalleryRow[]} */
  let galleryRows = [];
  let nextGalleryId = 1;

  const sortedGallery = () => [...galleryRows].sort((a, b) => a.position - b.position || a.id - b.id);

  async function listGallery() {
    return sortedGallery()
      .map((row) => galleryPhoto(row))
      .filter(Boolean);
  }

  function putGalleryPhotos(photos) {
    const assets = new Set(galleryRows.map((row) => row.asset));
    const fresh = [];
    for (const photo of (photos || []).map(galleryPhoto)) {
      if (!photo || assets.has(photo.asset)) continue;
      assets.add(photo.asset);
      fresh.push(photo);
    }
    if (!fresh.length) return;
    galleryRows = [
      ...galleryRows.map((row) => ({ ...row, position: row.position + fresh.length })),
      ...fresh.map((photo, index) => ({ id: nextGalleryId++, ...photo, position: index })),
    ];
  }

  function putHours(week) {
    const byDay = new Map(hours.map((row) => [row.day, row]));
    for (const raw of week.days || []) {
      const day = openingDay(raw);
      byDay.set(day.day, {
        id: DAYS.indexOf(day.day) + 1,
        ...day,
        updatedAt: week.updatedAt || "",
        updatedBy: week.updatedBy || "",
      });
    }
    hours = [...byDay.values()].sort((a, b) => a.id - b.id);
  }

  async function getOpeningHours() {
    if (hours.length !== DAYS.length) return null;
    return {
      days: hours.map((row) => openingDay(row)),
      updatedAt: hours[0].updatedAt,
      updatedBy: hours[0].updatedBy,
    };
  }

  function putParties({ updatedAt = "", updatedBy = "", ...facts }) {
    partyRows = [{ id: 1, ...partyFacts(facts), updatedAt: updatedAt || "", updatedBy: updatedBy || "" }];
  }

  async function getParties() {
    const row = partyRows[0];
    if (!row) return null;
    return { ...partyFacts(row), updatedAt: row.updatedAt, updatedBy: row.updatedBy };
  }

  if (openingHours) putHours(openingHours);
  if (parties) putParties(parties);
  putGalleryPhotos(gallery);

  return {
    getOpeningHours,
    async saveOpeningHours(week) {
      putHours(week);
      return getOpeningHours();
    },
    getParties,
    async saveParties(facts) {
      putParties(facts);
      return getParties();
    },
    listGallery,
    async addGalleryPhotos(photos) {
      putGalleryPhotos(photos);
      return listGallery();
    },
    async updateGalleryPhoto(key, changes = {}) {
      const row = galleryRows.find((photo) => photo.key === String(key ?? ""));
      if (!row) return null;
      if (changes.description !== undefined) row.description = changes.description;
      if (changes.menu !== undefined) row.menu = changes.menu;
      return galleryPhoto(row);
    },
    async orderGallery(keys) {
      const order = (keys || []).map(String);
      galleryRows = galleryRows.map((row) => {
        const index = order.indexOf(row.key);
        return { ...row, position: index >= 0 ? index : order.length + row.position };
      });
      return listGallery();
    },
    async removeGalleryPhoto(key) {
      galleryRows = galleryRows.filter((row) => row.key !== String(key ?? ""));
      return listGallery();
    },
    async exportAll() {
      return {
        openingHours: hours.map((row) => ({ ...row })),
        parties: partyRows.map((row) => ({ ...row })),
        gallery: [...galleryRows].sort((a, b) => a.id - b.id).map((row) => ({ ...row })),
      };
    },
    async importAll(snapshot) {
      hours = (snapshot.openingHours || []).map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
      partyRows = (snapshot.parties || []).map((row) => ({ ...row }));
      galleryRows = (snapshot.gallery || []).map((row) => ({ ...row }));
      nextGalleryId = Math.max(0, ...galleryRows.map((row) => row.id)) + 1;
    },
  };
}
