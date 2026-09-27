import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { resetBaserowClientForTests } from "../../platform/baserow.js";
import {
  createArtist,
  deleteArtist,
  listArtists,
  mapArtist,
  orderArtists,
  setArtistImage,
} from "./artist-store.js";
import { jsonResponse, mockOpsBaserow, opsCatalogTables } from "../../testing/test-baserow-mock.js";

afterEach(() => {
  vi.restoreAllMocks();
  resetBaserowClientForTests();
});

const tableEnv = { BASEROW_API_KEY: "token" };

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

describe("mapArtist / orderArtists", () => {
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

describe("setArtistImage", () => {
  it("appends an art file without replacing the portrait", async () => {
    const stored = row({
      id: 7,
      Portrait: [{ name: "face.jpg", url: "https://files.example/face.jpg" }],
      Art: [{ name: "one.jpg", url: "https://files.example/one.jpg" }],
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      mockOpsBaserow(async (_input, init, url) => {
        if (url.includes("/upload-file/")) {
          return jsonResponse({ name: "two.jpg", url: "https://files.example/two.jpg" });
        }
        if ((init?.method || "GET") === "PATCH") {
          const body = JSON.parse(init.body);
          assert.deepEqual(body, { Art: [{ name: "one.jpg" }, { name: "two.jpg" }] });
          return jsonResponse({
            ...stored,
            Art: [
              { name: "one.jpg", url: "https://files.example/one.jpg" },
              { name: "two.jpg", url: "https://files.example/two.jpg" },
            ],
          });
        }
        return jsonResponse(stored);
      }));
    const artist = await setArtistImage(tableEnv, "7", new Uint8Array([1, 2]), {
      filename: "two.jpg",
      contentType: "image/jpeg",
      kind: "art",
    });
    assert.deepEqual(
      artist.art.map((file) => file.name),
      ["one.jpg", "two.jpg"],
    );
    assert.equal(artist.portrait.name, "face.jpg");
  });
});
