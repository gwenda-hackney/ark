/**
 * What the venue relies on from events (event-galleries.js): each event's
 * gallery, for the Gallery page's "From events" (#291), which shows the
 * events the website's Photos page shows under the venue's own. The venue
 * (venue/server/venue-gallery.js) uses nothing else of events, so a change
 * here that breaks it fails in events' own tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseImageAssetId } from "../../../../../shared/sanity-image.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1EventRepository } from "./adapters/d1-events.js";
import { memoryEventRepository } from "./adapters/memory-events.js";
import { listEventGalleries } from "./event-galleries.js";

const ADAPTERS = {
  memory: () => memoryEventRepository(),
  d1: () => d1EventRepository(createTestD1("ops")),
};

/** A Sanity image asset id: the hash of its bytes, its size, its type. */
const asset = (n, size = "1600x1200") => `image-${String(n).padStart(40, "a")}-${size}-jpg`;
const cdn = (n, size = "1600x1200") => `https://cdn.sanity.io/images/proj/production/${String(n).padStart(40, "a")}-${size}.jpg`;
/** A photo as the Images tab keeps it. */
const kept = (key, n, added, { size, date = "" } = {}) => ({ key, asset: asset(n, size), date, added, source: "ops" });

for (const [name, make] of Object.entries(ADAPTERS)) {
  describe(`each event's gallery for the venue (${name})`, () => {
    it("lists the events with photos, by name, ids as text, each photo newest first with its address and size", async () => {
      const eventRepository = make();
      const jazz = await eventRepository.create({ name: "Jazz Night" });
      const pickle = await eventRepository.create({ name: "Chez Pickle", category: "popup" });
      await eventRepository.create({ name: "Quiz Night" });
      const gone = await eventRepository.create({ name: "Old Night" });
      await eventRepository.addGalleryPhoto(jazz.id, kept("j1", 1, "2026-11-01T21:00:00.000Z"));
      await eventRepository.addGalleryPhoto(jazz.id, kept("j2", 2, "2026-11-01T22:00:00.000Z", { date: "2026-10-31" }));
      await eventRepository.addGalleryPhoto(pickle.id, kept("p1", 3, "2026-11-10T20:00:00.000Z", { size: "600x900" }));
      await eventRepository.addGalleryPhoto(gone.id, kept("o1", 4, "2026-11-11T20:00:00.000Z"));
      await eventRepository.update(gone.id, { deletedAt: "2026-11-11T21:00:00.000Z" });

      const galleries = await listEventGalleries({ eventRepository, SANITY_PROJECT_ID: "proj" });
      assert.deepEqual(galleries, [
        {
          id: String(pickle.id),
          name: "Chez Pickle",
          photos: [
            { key: "p1", asset: asset(3, "600x900"), url: cdn(3, "600x900"), width: 600, height: 900, added: "2026-11-10T20:00:00.000Z" },
          ],
        },
        {
          id: String(jazz.id),
          name: "Jazz Night",
          photos: [
            { key: "j2", asset: asset(2), url: cdn(2), width: 1600, height: 1200, added: "2026-11-01T22:00:00.000Z" },
            { key: "j1", asset: asset(1), url: cdn(1), width: 1600, height: 1200, added: "2026-11-01T21:00:00.000Z" },
          ],
        },
      ]);
      // The venue knows a picture by its asset's hash; the website by the same hash in its address.
      for (const photo of galleries.flatMap((event) => event.photos)) {
        assert.ok(photo.url.includes(`/${parseImageAssetId(photo.asset).sha1}-`), photo.url);
      }
    });

    it("is empty when no event has photos", async () => {
      const eventRepository = make();
      await eventRepository.create({ name: "Quiz Night" });
      assert.deepEqual(await listEventGalleries({ eventRepository }), []);
    });
  });
}
