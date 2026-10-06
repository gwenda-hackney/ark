/**
 * What every ArtistRepository adapter must do (#186, #127): the same cases
 * run on memory, Baserow (the fake world) and D1 (SQLite with the real
 * migrations), plus the copy between them that data-move relies on.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { artistRepository } from "../../../../../shared/artists/artist-repository.js";
import { baserowArtistRepository } from "../../../../../shared/artists/baserow-artists.js";
import { d1ArtistRepository } from "../../../../../shared/artists/d1-artists.js";
import { memoryArtistRepository } from "../../../../../shared/artists/memory-artists.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { createFakeWorld } from "../../testing/fake-world.js";

const worlds = [];
afterEach(() => {
  while (worlds.length) worlds.pop().restore();
});

async function fakeWorld() {
  const world = await createFakeWorld();
  world.install();
  worlds.push(world);
  return world;
}

const ADAPTERS = {
  memory: () => memoryArtistRepository(),
  baserow: async () => baserowArtistRepository((await fakeWorld()).env),
  d1: () => d1ArtistRepository(createTestD1("ops")),
};

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";
const OTHER = "image-ffeeddccbbaa99887766554433221100ffeeddcc-1200x800-png";
const THIRD = "image-1111111111111111111111111111111111111111-400x400-webp";
const missingId = 987_654;

function amina(overrides = {}) {
  return {
    name: "Amina Cole",
    slot: "current",
    artistName: "Amina",
    website: "https://amina.example/",
    profile: "Painter.",
    bio: "A longer note.\n\nTwo paragraphs.",
    startMonth: "9",
    endMonth: "10",
    portrait: { asset: ASSET, label: "" },
    art: [
      { asset: OTHER, label: "Blue.png" },
      { asset: THIRD, label: "Red.webp" },
    ],
    gwenda: [{ asset: ASSET, label: "At the bar" }],
    ...overrides,
  };
}

const withoutId = ({ id: _id, ...rest }) => rest;

repositoryContract("ArtistRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    await repo.createArtist(amina());
    await repo.createArtist({ name: "Jo", slot: "previous" });
    await repo.createArtist({
      name: "Being prepared",
      bio: "Not on the wall yet.",
    });
    await repo.saveGuestArtist("DJ@Example.com", {
      decision: "Approved",
      artistName: "DJ Bee",
      artistLink: "https://bee.example/",
    });
    await repo.saveGuestArtist("quiet@example.com", { decision: "Declined" });
  },
  cases: {
    "creates an artist and reads every field back": async (repo) => {
      const created = await repo.createArtist(amina());
      assert.equal(typeof created.id, "number");
      assert.deepEqual(withoutId(created), amina());
      assert.deepEqual(await repo.getArtist(created.id), created);
      assert.deepEqual(await repo.getArtist(String(created.id)), created);
    },
    "a new artist starts with no photos": async (repo) => {
      const created = await repo.createArtist({ name: "Jo", slot: "next" });
      assert.deepEqual(
        {
          portrait: created.portrait,
          art: created.art,
          gwenda: created.gwenda,
        },
        { portrait: null, art: [], gwenda: [] },
      );
      assert.equal(created.artistName, "");
      assert.equal(created.startMonth, "");
    },
    "an artist with no slot is kept, slot empty": async (repo) => {
      const created = await repo.createArtist({
        name: "Being prepared",
        bio: "Soon.",
      });
      assert.equal(created.slot, "");
      assert.deepEqual(await repo.getArtist(created.id), created);
      assert.ok(
        (await repo.listArtists()).some((artist) => artist.id === created.id),
      );
    },
    "keeps slots and months the one way": async (repo) => {
      const created = await repo.createArtist({
        name: "Ada",
        slot: "PREVIOUS",
        startMonth: "September",
        endMonth: "13",
      });
      assert.equal(created.slot, "previous");
      assert.equal(created.startMonth, "9");
      assert.equal(created.endMonth, "");
    },
    "lists every artist by id": async (repo) => {
      const a = await repo.createArtist({ name: "B", slot: "previous" });
      const b = await repo.createArtist({ name: "A", slot: "current" });
      const ids = (await repo.listArtists())
        .map((artist) => artist.id)
        .filter((id) => [a.id, b.id].includes(id));
      assert.deepEqual(ids, [a.id, b.id]);
    },
    "update changes only the given fields": async (repo) => {
      const created = await repo.createArtist(amina());
      const updated = await repo.updateArtist(created.id, {
        slot: "previous",
        bio: "",
      });
      assert.deepEqual(updated, { ...created, slot: "previous", bio: "" });
      assert.deepEqual(await repo.getArtist(created.id), updated);
    },
    "photos change through update, in order, labels kept": async (repo) => {
      const created = await repo.createArtist(amina());
      const art = [
        { asset: THIRD, label: "Red.webp" },
        { asset: ASSET, label: "New one" },
      ];
      const updated = await repo.updateArtist(created.id, {
        art,
        portrait: { asset: OTHER, label: "dropped" },
      });
      assert.deepEqual(updated.art, art);
      assert.deepEqual(
        updated.portrait,
        { asset: OTHER, label: "" },
        "a portrait keeps no label",
      );
      assert.deepEqual(updated.gwenda, created.gwenda);
      const cleared = await repo.updateArtist(created.id, {
        portrait: null,
        gwenda: [],
      });
      assert.equal(cleared.portrait, null);
      assert.deepEqual(cleared.gwenda, []);
      assert.deepEqual(cleared.art, art);
    },
    "a missing artist: null to read, 404 to update, fine to remove": async (
      repo,
    ) => {
      assert.equal(await repo.getArtist(missingId), null);
      await assert.rejects(repo.updateArtist(missingId, { bio: "x" }), {
        status: 404,
      });
      await repo.removeArtist(missingId);
    },
    "removes an artist": async (repo) => {
      const created = await repo.createArtist({
        name: "Gone",
        slot: "previous",
      });
      await repo.removeArtist(created.id);
      assert.equal(await repo.getArtist(created.id), null);
      assert.ok(
        !(await repo.listArtists()).some((artist) => artist.id === created.id),
      );
    },
    "a guest artist is kept by email, lower case": async (repo) => {
      const saved = await repo.saveGuestArtist(" DJ@Example.com ", {
        decision: "Approved",
      });
      assert.equal(typeof saved.id, "number");
      assert.deepEqual(withoutId(saved), {
        email: "dj@example.com",
        decision: "Approved",
        artistName: "",
        artistLink: "",
      });
      const again = await repo.saveGuestArtist("dj@example.com", {
        artistName: "DJ Bee",
        artistLink: "https://bee.example/",
      });
      assert.deepEqual(again, {
        ...saved,
        artistName: "DJ Bee",
        artistLink: "https://bee.example/",
      });
      const cleared = await repo.saveGuestArtist("dj@EXAMPLE.com", {
        decision: "",
      });
      assert.deepEqual(cleared, { ...again, decision: "" });
      assert.deepEqual(
        await repo.saveGuestArtist("dj@example.com", {}),
        cleared,
        "nothing to change is fine",
      );
      const listed = (await repo.listGuestArtists()).filter(
        (record) => record.email === "dj@example.com",
      );
      assert.deepEqual(listed, [cleared]);
    },
    "a guest artist needs an email": async (repo) => {
      await assert.rejects(
        repo.saveGuestArtist(" ", { decision: "Approved" }),
        { status: 400 },
      );
    },
    "exports artists and guest artists": async (repo) => {
      const artist = await repo.createArtist(amina());
      const guest = await repo.saveGuestArtist("a@example.com", {
        decision: "Declined",
      });
      const snapshot = await repo.exportAll();
      assert.deepEqual(Object.keys(snapshot).sort(), [
        "artists",
        "guestArtists",
      ]);
      assert.deepEqual(
        snapshot.artists.find((record) => record.id === artist.id),
        artist,
      );
      assert.deepEqual(
        snapshot.guestArtists.find((record) => record.id === guest.id),
        guest,
      );
    },
  },
});

describe("D1 artists", () => {
  it("refuses a photo still kept as a Baserow file: the backfill moves it first", async () => {
    const repo = d1ArtistRepository(createTestD1("ops"));
    const file = {
      name: "abc_face.jpg",
      label: "face.jpg",
      url: "https://files/abc_face.jpg",
      thumb: "",
    };
    await assert.rejects(
      repo.importAll({
        artists: [{ id: 3, ...amina({ portrait: file }) }],
        guestArtists: [],
      }),
      /backfill/,
    );
  });

  it("keeps imported ids, and new rows come after them", async () => {
    const repo = d1ArtistRepository(createTestD1("ops"));
    await repo.importAll({
      artists: [{ id: 40, ...amina() }],
      guestArtists: [{ id: 41, email: "x@example.com" }],
    });
    assert.equal((await repo.getArtist(40)).name, "Amina Cole");
    assert.ok(
      (await repo.createArtist({ name: "Next", slot: "next" })).id > 40,
    );
  });
});

describe("artists in data-move", () => {
  it("moves every artist row, slot or not; only a blank one is left out", async () => {
    const { FEATURES } =
      await import("../../../../../scripts/lib/data-move/features.mjs");
    const { keep } = FEATURES.artists;
    assert.equal(
      keep("artists", { id: 1, name: "Being prepared", slot: "" }),
      true,
    );
    assert.equal(
      keep("artists", { id: 2, name: "", slot: "", bio: "Notes only" }),
      true,
    );
    assert.equal(
      keep("artists", {
        id: 3,
        name: "",
        slot: "",
        art: [],
        gwenda: [],
        portrait: null,
      }),
      false,
    );
    assert.equal(keep("guestArtists", { id: 4, email: "" }), false);
  });
});

describe("artistRepository", () => {
  it("stays on Baserow until store:artists says d1, then reads D1", async () => {
    const world = await fakeWorld();
    const OPS_DB = createTestD1("ops");
    await d1ArtistRepository(OPS_DB).importAll({
      artists: [{ id: 7, ...amina({ name: "On D1" }) }],
      guestArtists: [],
    });
    const env = { ...world.env, OPS_DB };

    await baserowArtistRepository(world.env).createArtist({
      name: "On Baserow",
      slot: "current",
    });
    assert.deepEqual(
      (await artistRepository(env).listArtists()).map((artist) => artist.name),
      ["On Baserow"],
    );

    await OPS_DB.prepare(
      "INSERT INTO _meta (key, value) VALUES ('store:artists', 'd1')",
    ).run();
    // A new runtime: each one keeps the flag it read for a few seconds.
    const onD1 = await artistRepository({ ...env }).listArtists();
    assert.deepEqual(
      onD1.map((artist) => artist.name),
      ["On D1"],
    );
  });

  it("uses env.artistRepository when a test hands one in", () => {
    const repo = memoryArtistRepository();
    assert.equal(artistRepository({ artistRepository: repo }), repo);
  });
});
