import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { d1ArtistRepository } from "../../../../../shared/artists/d1-artists.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { clearArtistImage, createArtist, deleteArtist, getArtist, setArtistImage } from "./artist-store.js";
import { artistView, listArtists, orderArtists } from "../../../../../shared/artists.js";
import { artistRecord } from "../../../../../shared/artists/artist-model.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ASSET = "image-0a1b2c3d4e5f-1600x1000-jpg";
const OTHER = "image-ffeeddccbbaa-800x600-png";

/** An artist as ops shows them. */
const shown = (fields, options) => artistView(artistRecord({ id: 1, name: "Amina Cole", slot: "current", ...fields }), options);

/** A dev env whose ops database holds these artists, Sanity faked for uploads. */
async function world(artists = [], uploaded = ASSET) {
  const db = createTestD1("ops");
  const repo = d1ArtistRepository(db);
  await repo.importAll({ artists, guestArtists: [] });
  const uploads = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("api.sanity.io") && url.includes("/assets/images/")) {
      uploads.push(new URL(url).searchParams.get("filename"));
      return jsonResponse({ document: { _id: uploaded } });
    }
    throw new Error(`unexpected ${url}`);
  });
  const env = { SITE_ENV: "dev", SANITY_API_TOKEN: "sanity", SANITY_PROJECT_ID: "gwscpagy", OPS_DB: db };
  return { env, repo, uploads };
}

describe("artistView / orderArtists", () => {
  it("orders current, next, then previous by name", () => {
    const current = shown({ id: 4, website: "https://amina.example" });
    const next = shown({ id: 2, name: "Jo", slot: "next" });
    const ada = shown({ id: 8, name: "Ada", slot: "previous" });
    const bea = shown({ id: 6, name: "Bea", slot: "previous" });
    assert.equal(current.slot, "current");
    assert.equal(current.artistName, "");
    assert.equal(next.website, "");
    const ordered = orderArtists([bea, ada, next, current, shown({ id: 3, slot: "" })]);
    assert.deepEqual(
      ordered.map((artist) => artist.name),
      ["Amina Cole", "Jo", "Ada", "Bea"],
    );
  });
});

describe("listArtists / createArtist / deleteArtist", () => {
  it("returns an empty list when nobody has a slot", async () => {
    const { env } = await world([{ id: 1, name: "Being prepared", slot: "" }]);
    assert.deepEqual(await listArtists(env), []);
  });

  it("fails when the ops database can't be reached", async () => {
    await assert.rejects(() => listArtists({ SITE_ENV: "dev" }), /OPS_DB/);
  });

  it("moves the current artist to previous when someone else takes that badge", async () => {
    const { env, repo } = await world([{ id: 4, name: "Rita Matos", slot: "current" }]);
    const created = await createArtist(env, {
      name: "New Guest",
      artistName: "Rita",
      website: "rita.example",
      profile: "Painter.",
      bio: "",
      slot: "current",
      startMonth: "September",
      endMonth: "October",
    });
    assert.equal(created.startMonth, "9");
    assert.equal(created.endMonth, "10");
    assert.equal(created.slot, "current");
    assert.equal(created.artistName, "Rita");
    assert.equal(created.website, "https://rita.example");
    assert.equal((await repo.getArtist(4)).slot, "previous");
  });

  it("deletes a previous artist by id", async () => {
    const { env, repo } = await world([{ id: 8, name: "Ada", slot: "previous" }]);
    assert.deepEqual(await deleteArtist(env, "8"), { ok: true, id: "8" });
    assert.equal(await repo.getArtist(8), null);
  });
});

describe("artist photos in Sanity (#183)", () => {
  it("shows Sanity photos from the CDN", () => {
    const artist = shown(
      { portrait: { asset: ASSET }, art: [{ asset: OTHER, label: "Blue.png" }], gwenda: [] },
      { projectId: "gwscpagy" },
    );
    assert.equal(artist.portrait.name, ASSET);
    assert.match(artist.portrait.url, /^https:\/\/cdn\.sanity\.io\/images\/gwscpagy\/production\/0a1b2c3d4e5f-1600x1000\.jpg\?/);
    assert.deepEqual(
      artist.art.map((image) => [image.name, image.label]),
      [[OTHER, "Blue.png"]],
    );
    assert.match(artist.art[0].thumb, /w=400/);
    assert.deepEqual(artist.gwenda, []);
  });

  it("uploads a photo to Sanity and adds its asset id to the list", async () => {
    const { env, uploads } = await world([
      { id: 7, name: "Amina", slot: "current", portrait: { asset: OTHER }, art: [{ asset: OTHER, label: "one.png" }] },
    ]);
    const artist = await setArtistImage(env, "7", new Uint8Array([1, 2]), {
      filename: "two.jpg",
      contentType: "image/jpeg",
      kind: "art",
    });
    assert.deepEqual(uploads, ["two.jpg"]);
    assert.deepEqual(
      artist.art.map((image) => [image.name, image.label]),
      [
        [OTHER, "one.png"],
        [ASSET, "two.jpg"],
      ],
    );
    assert.equal(artist.portrait.name, OTHER);
  });

  it("a new portrait replaces the old one", async () => {
    const { env } = await world([{ id: 7, name: "Amina", slot: "current", portrait: { asset: OTHER } }]);
    const artist = await setArtistImage(env, "7", new Uint8Array([1]), {
      filename: "face.jpg",
      contentType: "image/jpeg",
      kind: "portrait",
    });
    assert.equal(artist.portrait.name, ASSET);
  });

  it("takes a photo off by its asset id, and the portrait", async () => {
    const { env } = await world([
      {
        id: 7,
        name: "Amina",
        slot: "current",
        portrait: { asset: ASSET },
        gwenda: [
          { asset: ASSET, label: "a" },
          { asset: OTHER, label: "b" },
        ],
      },
    ]);
    const artist = await clearArtistImage(env, "7", { kind: "gwenda", name: ASSET });
    assert.deepEqual(artist.gwenda.map((image) => image.name), [OTHER]);
    const cleared = await clearArtistImage(env, "7", { kind: "portrait" });
    assert.equal(cleared.portrait, null);
  });
});

describe("artist use cases", () => {
  it("keep one current artist and add photos", async () => {
    const { env } = await world();
    const first = await createArtist(env, { name: "Ada", slot: "current" });
    const second = await createArtist(env, { name: "Bea", slot: "current" });
    assert.equal((await getArtist(env, first.id)).slot, "previous");
    const withArt = await setArtistImage(env, second.id, new Uint8Array([1]), {
      filename: "one.jpg",
      contentType: "image/jpeg",
      kind: "art",
    });
    assert.deepEqual(withArt.art.map((image) => [image.name, image.label]), [[ASSET, "one.jpg"]]);
    assert.match(withArt.art[0].url, /cdn\.sanity\.io\/images\/gwscpagy\//);
    const removed = await clearArtistImage(env, second.id, { kind: "art", name: ASSET });
    assert.deepEqual(removed.art, []);
    await deleteArtist(env, first.id);
    await assert.rejects(getArtist(env, first.id), { status: 404 });
  });
});
