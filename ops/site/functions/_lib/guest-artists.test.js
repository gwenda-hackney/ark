import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { planArtistUpdate } from "./guest-artists.js";

const today = "2026-09-26";
const from = { name: "DJ Bee", link: "https://www.instagram.com/djbee/" };
const to = { name: "DJ Bee", link: "https://djbee.example/" };
const night = (id, date, overrides = {}) => ({ id, date, overrides: { artist: "", pageUrl: "", ...overrides } });

describe("planArtistUpdate", () => {
  it("updates a series whose guest is the old artist; its nights follow it", () => {
    const events = [
      { id: "1", artist: "DJ Bee", pageUrl: from.link, dates: [night("a", "2026-10-01"), night("b", "2026-10-08")] },
    ];
    const plan = planArtistUpdate(events, { from, to }, today);
    assert.deepEqual(plan.series, [{ id: "1", patch: { artist: "DJ Bee", pageUrl: to.link } }]);
    assert.deepEqual(plan.nights, []);
  });

  it("updates an upcoming night with its own guest, leaves past nights and other guests", () => {
    const events = [
      {
        id: "2",
        artist: "Resident",
        pageUrl: "https://resident.example/",
        dates: [
          night("past", "2026-09-19", { artist: "DJ Bee", pageUrl: from.link }),
          night("next", "2026-10-03", { artist: "dj bee", pageUrl: from.link }),
          night("other", "2026-10-10", { artist: "Someone", pageUrl: "https://someone.example/" }),
          night("edited", "2026-10-17", { artist: "DJ Bee", pageUrl: "https://changed.example/" }),
        ],
      },
    ];
    const plan = planArtistUpdate(events, { from, to }, today);
    assert.deepEqual(plan.series, []);
    assert.deepEqual(plan.nights.map((item) => item.rows.map((row) => [row.id, row.overrides])), [
      [["next", { artist: "DJ Bee", pageUrl: to.link }]],
    ]);
  });

  it("a night that only overrides the link takes the new link, keeping the series' name", () => {
    const events = [
      {
        id: "3",
        artist: "DJ Bee",
        pageUrl: "https://series.example/",
        dates: [night("n", "2026-10-03", { pageUrl: from.link })],
      },
    ];
    const plan = planArtistUpdate(events, { from, to }, today);
    assert.deepEqual(plan.series, []);
    assert.deepEqual(plan.nights[0].rows[0].overrides, { artist: "", pageUrl: to.link });
  });

  it("a series with no nights ahead is left alone, and no change means no plan", () => {
    const events = [{ id: "4", artist: "DJ Bee", pageUrl: from.link, dates: [night("old", "2026-01-01")] }];
    assert.deepEqual(planArtistUpdate(events, { from, to }, today), { series: [], nights: [] });
    const live = [{ id: "5", artist: "DJ Bee", pageUrl: from.link, dates: [night("n", "2026-10-01")] }];
    assert.deepEqual(planArtistUpdate(live, { from, to: from }, today), { series: [], nights: [] });
  });
});
