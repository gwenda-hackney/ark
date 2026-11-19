import { describe, expect, it, vi } from "vitest";
import { memorySeasonRepository } from "./server/adapters/memory-seasons.js";
import { deleteSeason, listSeasons, saveSeason, setSeasonImage } from "./server/seasons.js";
import { seasonsDocument } from "./server/seasons-website.js";

const now = new Date("2026-11-19T12:00:00Z");
const christmas = {
  name: "Christmas parties",
  line: "Book the back room for your work do.",
  included: "Welcome drink\nCanapés",
  covers: "Throughout December",
  showFrom: "2026-11-01",
  showUntil: "2026-12-20",
};

function world() {
  const env = { seasonRepository: memorySeasonRepository(), SANITY_PROJECT_ID: "proj" };
  const putOnWebsite = vi.fn(async () => ({ published: true, warnings: [] }));
  const onWebsite = vi.fn(async () => "live");
  return { env, putOnWebsite, onWebsite, deps: { putOnWebsite, onWebsite, now } };
}

describe("seasons", () => {
  it("saves a new season and puts every season on the website", async () => {
    const { env, putOnWebsite, deps } = world();
    const result = await saveSeason(env, christmas, { by: "owner@gwenda.co.uk", ...deps });
    expect(result).toMatchObject({
      season: { id: 1, name: "Christmas parties", state: "showing", updatedBy: "owner@gwenda.co.uk" },
      website: "live",
      published: true,
    });
    expect(putOnWebsite).toHaveBeenCalledWith(env, [expect.objectContaining({ id: 1, name: "Christmas parties" })]);
  });

  it("refuses one without a name, saving nothing", async () => {
    const { env, putOnWebsite, deps } = world();
    await expect(saveSeason(env, { ...christmas, name: "" }, deps)).rejects.toMatchObject({
      status: 400,
      problems: { name: "Give it a name." },
    });
    expect(putOnWebsite).not.toHaveBeenCalled();
    expect(await env.seasonRepository.list()).toEqual([]);
  });

  it("keeps a season's picture when its words change", async () => {
    const { env, deps } = world();
    await saveSeason(env, christmas, deps);
    await setSeasonImage(env, 1, { bytes: new Uint8Array(), filename: "room.jpg" }, {
      alt: "The back room",
      upload: async () => "image-abc-1200x800-jpg",
      ...deps,
    });
    const { season } = await saveSeason(env, { ...christmas, line: "Now with a DJ." }, { id: 1, ...deps });
    expect(season).toMatchObject({
      line: "Now with a DJ.",
      image: { asset: "image-abc-1200x800-jpg", alt: "The back room" },
      imageUrl: "https://cdn.sanity.io/images/proj/production/abc-1200x800.jpg?w=800",
    });
  });

  it("takes a picture off", async () => {
    const { env, deps } = world();
    await saveSeason(env, christmas, deps);
    await setSeasonImage(env, 1, { bytes: new Uint8Array() }, { upload: async () => "image-abc-1200x800-jpg", ...deps });
    const { season } = await setSeasonImage(env, 1, null, deps);
    expect(season.image).toBeNull();
  });

  it("still saves when the website can't be reached, and says so", async () => {
    const { env, deps } = world();
    const putOnWebsite = async () => {
      throw new Error("Sanity is down");
    };
    const result = await saveSeason(env, christmas, { ...deps, putOnWebsite });
    expect(result.published).toBe(false);
    expect(result.warnings[0]).toMatch(/Saved in ops, but the website didn't get it: Sanity is down/);
    expect(await env.seasonRepository.list()).toHaveLength(1);
  });

  it("lists showing first, and takes one out", async () => {
    const { env, deps } = world();
    await saveSeason(env, { ...christmas, name: "Old", showFrom: "2025-11-01", showUntil: "2025-12-20" }, deps);
    await saveSeason(env, christmas, deps);
    const { seasons } = await listSeasons(env, deps);
    expect(seasons.map((item) => [item.name, item.state])).toEqual([
      ["Christmas parties", "showing"],
      ["Old", "over"],
    ]);
    await deleteSeason(env, 1, deps);
    expect((await listSeasons(env, deps)).seasons.map((item) => item.name)).toEqual(["Christmas parties"]);
    await expect(deleteSeason(env, 99, deps)).rejects.toMatchObject({ status: 404 });
  });
});

describe("the website's document", () => {
  it("has every season, blank fields left out, what's included a line each", () => {
    expect(
      seasonsDocument([
        { id: 1, ...christmas, image: { asset: "image-abc-1200x800-jpg", alt: "The back room" } },
        { id: 2, name: "Summer", line: "", included: "", covers: "", showFrom: "2027-05-01", showUntil: "2027-08-31", image: null },
      ]),
    ).toEqual({
      _id: "seasons",
      _type: "seasons",
      items: [
        {
          _key: "season-1",
          name: "Christmas parties",
          line: "Book the back room for your work do.",
          included: ["Welcome drink", "Canapés"],
          covers: "Throughout December",
          showFrom: "2026-11-01",
          showUntil: "2026-12-20",
          image: { _type: "image", alt: "The back room", asset: { _type: "reference", _ref: "image-abc-1200x800-jpg" } },
        },
        { _key: "season-2", name: "Summer", showFrom: "2027-05-01", showUntil: "2027-08-31" },
      ],
    });
  });
});
