import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { resetBaserowClientForTests } from "../../../../../shared/baserow.js";
import { d1ArtistRepository } from "../../../../../shared/artists/d1-artists.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { clearArtistImage, createArtist, deleteArtist, getArtist, setArtistImage } from "./artist-store.js";
import { artistView, listArtists, orderArtists } from "../../../../../shared/artists.js";
import { artistFromRow } from "../../../../../shared/artists/baserow-artists.js";
import { jsonResponse, mockOpsBaserow, opsCatalogTables } from "../../testing/test-baserow-mock.js";

afterEach(() => {
  vi.restoreAllMocks();
  resetBaserowClientForTests();
});

const tableEnv = { BASEROW_API_KEY: "token" };

/** A Baserow row as ops shows it. */
const mapArtist = (row, options) => artistView(artistFromRow(row), options);

function row(partial) {
  return {
    id: 1,
    Name: "Amina Cole",
    Slot: { id: 1, value: "current", color: "green" },
    Website: "https://amina.example",
    Profile: "Painter.",
    Bio: "A longer note.",
    Portrait: [],
    Art: [],
    "Gwenda photos": [],
    ...partial,
  };
}

describe("artistView / orderArtists", () => {
  it("orders current, next, then previous by name", () => {
    const current = mapArtist(row({ id: 4 }));
    const next = mapArtist(row({ id: 2, Name: "Jo", Slot: "next", Website: "" }));
    const ada = mapArtist(row({ id: 8, Name: "Ada", Slot: "previous" }));
    const bea = mapArtist(row({ id: 6, Name: "Bea", Slot: { value: "previous" } }));
    assert.equal(current.slot, "current");
    assert.equal(current.artistName, "");
    assert.equal(next.website, "");
    const ordered = orderArtists([bea, ada, next, current, mapArtist({ id: 3 })]);
    assert.deepEqual(
      ordered.map((artist) => artist.name),
      ["Amina Cole", "Jo", "Ada", "Bea"],
    );
  });
});

describe("listArtists / createArtist / deleteArtist", () => {
  it("returns an empty list when the table has no slotted rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async () => jsonResponse({ results: [] })));
    assert.deepEqual(await listArtists(tableEnv), []);
  });

  it("fails when the Artists table is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation( async (input) => {
      const url = String(input);
      if (url.includes("/tables/all-tables/")) {
        return jsonResponse(
          opsCatalogTables().filter((table) => table.name !== "Artists"),
        );
      }
      return jsonResponse({ results: [] });
    });
    await assert.rejects(
      () => listArtists(tableEnv),
      (error) => error.status === 503,
    );
  });

  it("moves the current artist to previous when someone else takes that badge", async () => {
    const patches = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, init, url) => {
        const method = init?.method || "GET";
        if (method === "PATCH") {
          patches.push(JSON.parse(init.body));
          return jsonResponse(row({ id: 4, Slot: "previous" }));
        }
        if (method === "POST") {
          const body = JSON.parse(init.body);
          assert.equal(body.Slot, "current");
          assert.equal(body.Name, "New Guest");
          assert.equal(body["Artist name"], "Rita");
          assert.equal(body["Start month"], "9");
          assert.equal(body["End month"], "10");
          assert.equal(body.Website, "https://rita.example");
          return jsonResponse({
            id: 9,
            ...body,
            Portrait: [],
            Art: [],
            "Gwenda photos": [],
          });
        }
        return jsonResponse({ results: [row({ id: 4, Name: "Rita Matos" })] });
      }));
    const created = await createArtist(tableEnv, {
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
    assert.equal(created.id, "9");
    assert.equal(created.slot, "current");
    assert.equal(created.artistName, "Rita");
    assert.deepEqual(patches, [{ Slot: "previous" }]);
  });

  it("deletes a previous artist by id", async () => {
    let deleted = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, init, url) => {
        if ((init?.method || "GET") === "DELETE") {
          deleted = url;
          return jsonResponse({});
        }
        return jsonResponse(row({ id: 8, Name: "Ada", Slot: "previous" }));
      }));
    const result = await deleteArtist(tableEnv, "8");
    assert.deepEqual(result, { ok: true, id: "8" });
    assert.match(deleted, /\/rows\/table\/66\/8\//);
  });
});

const ASSET = "image-0a1b2c3d4e5f-1600x1000-jpg";
const OTHER = "image-ffeeddccbbaa-800x600-png";
const imageEnv = { ...tableEnv, SITE_ENV: "dev", SANITY_API_TOKEN: "sanity", SANITY_PROJECT_ID: "gwscpagy" };

/** Ops Baserow and Sanity: the row as stored, every PATCH, every upload. */
function imageWorld(stored, uploaded = ASSET) {
  const patches = [];
  const uploads = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(
    mockOpsBaserow(async (_input, init, url) => {
      if (url.includes("api.sanity.io") && url.includes("/assets/images/")) {
        uploads.push(new URL(url).searchParams.get("filename"));
        return jsonResponse({ document: { _id: uploaded } });
      }
      if (url.includes("/upload-file/")) throw new Error("photos don't go to Baserow any more");
      if ((init?.method || "GET") === "PATCH") {
        const body = JSON.parse(init.body);
        patches.push(body);
        return jsonResponse({ ...stored, ...body });
      }
      return jsonResponse(stored);
    }));
  return { patches, uploads };
}

describe("artist photos in Sanity (#183)", () => {
  it("shows Sanity photos from the CDN, and files from before until they move", () => {
    const artist = mapArtist(
      row({
        "Portrait asset": ASSET,
        Portrait: [{ name: "old.jpg", url: "https://files.example/old.jpg" }],
        "Art assets": JSON.stringify([{ asset: OTHER, label: "Blue.png" }]),
        Art: [{ name: "stale.jpg", url: "https://files.example/stale.jpg" }],
        "Gwenda assets": "",
        "Gwenda photos": [{ name: "bar.jpg", url: "https://files.example/bar.jpg" }],
      }),
      { projectId: "gwscpagy" },
    );
    assert.equal(artist.portrait.name, ASSET);
    assert.match(artist.portrait.url, /^https:\/\/cdn\.sanity\.io\/images\/gwscpagy\/production\/0a1b2c3d4e5f-1600x1000\.jpg\?/);
    assert.deepEqual(
      artist.art.map((image) => [image.name, image.label]),
      [[OTHER, "Blue.png"]],
    );
    assert.match(artist.art[0].thumb, /w=400/);
    assert.deepEqual(
      artist.gwenda.map((image) => image.url),
      ["https://files.example/bar.jpg"],
    );
    const moved = mapArtist(row({ "Art assets": "[]", Art: [{ name: "x.jpg", url: "https://files.example/x.jpg" }] }));
    assert.deepEqual(moved.art, [], "[] has moved: the old files no longer show");
  });

  it("uploads a photo to Sanity and adds its asset id to the list", async () => {
    const stored = row({
      id: 7,
      "Portrait asset": OTHER,
      "Art assets": JSON.stringify([{ asset: OTHER, label: "one.png" }]),
    });
    const { patches, uploads } = imageWorld(stored);
    const artist = await setArtistImage(imageEnv, "7", new Uint8Array([1, 2]), {
      filename: "two.jpg",
      contentType: "image/jpeg",
      kind: "art",
    });
    assert.deepEqual(uploads, ["two.jpg"]);
    assert.deepEqual(patches, [
      { "Art assets": JSON.stringify([{ asset: OTHER, label: "one.png" }, { asset: ASSET, label: "two.jpg" }]) },
    ]);
    assert.deepEqual(
      artist.art.map((image) => image.name),
      [OTHER, ASSET],
    );
    assert.equal(artist.portrait.name, OTHER);
  });

  it("a new portrait replaces the old one", async () => {
    const { patches } = imageWorld(row({ id: 7, Portrait: [{ name: "old.jpg", url: "https://files.example/old.jpg" }] }));
    const artist = await setArtistImage(imageEnv, "7", new Uint8Array([1]), {
      filename: "face.jpg",
      contentType: "image/jpeg",
      kind: "portrait",
    });
    assert.deepEqual(patches, [{ "Portrait asset": ASSET }]);
    assert.equal(artist.portrait.asset, ASSET);
  });

  it("waits for the backfill when the list is still Baserow files", async () => {
    const { uploads } = imageWorld(row({ id: 7, Art: [{ name: "one.jpg", url: "https://files.example/one.jpg" }] }));
    await assert.rejects(
      () => setArtistImage(imageEnv, "7", new Uint8Array([1]), { filename: "a.jpg", contentType: "image/jpeg", kind: "art" }),
      (error) => error.status === 409,
    );
    assert.deepEqual(uploads, []);
  });

  it("takes a photo off by its asset id, and the portrait with its old file", async () => {
    const stored = row({
      id: 7,
      "Portrait asset": ASSET,
      "Gwenda assets": JSON.stringify([{ asset: ASSET, label: "a" }, { asset: OTHER, label: "b" }]),
    });
    const { patches } = imageWorld(stored);
    const artist = await clearArtistImage(imageEnv, "7", { kind: "gwenda", name: ASSET });
    assert.deepEqual(artist.gwenda.map((image) => image.name), [OTHER]);
    await clearArtistImage(imageEnv, "7", { kind: "portrait" });
    assert.deepEqual(patches, [
      { "Gwenda assets": JSON.stringify([{ asset: OTHER, label: "b" }]) },
      { "Portrait asset": "", Portrait: [] },
    ]);
  });

  it("still takes off a photo kept as a Baserow file", async () => {
    const { patches } = imageWorld(
      row({ id: 7, Art: [{ name: "one.jpg", url: "https://files.example/one.jpg" }, { name: "two.jpg", url: "https://files.example/two.jpg" }] }),
    );
    await clearArtistImage(imageEnv, "7", { kind: "art", name: "one.jpg" });
    assert.deepEqual(patches, [{ Art: [{ name: "two.jpg" }] }]);
  });
});

describe("artist use cases on D1 (#127)", () => {
  it("keep one current artist and add photos, whatever holds them", async () => {
    const artistRepository = d1ArtistRepository(createTestD1("ops"));
    const env = { ...imageEnv, artistRepository };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/assets/images/")) return jsonResponse({ document: { _id: ASSET } });
      throw new Error(`unexpected ${input}`);
    });
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
