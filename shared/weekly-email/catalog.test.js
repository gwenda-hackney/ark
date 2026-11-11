import { describe, expect, it } from "vitest";
import { fetchWeeklyCatalog, mapCatalog, mapEvent, pictureUrl } from "./catalog.js";

const block = (text) => [{ _type: "block", children: [{ _type: "span", text }] }];
const asset = { url: "https://cdn.sanity.io/images/p/d/abc-1000x2000.jpg", metadata: { dimensions: { width: 1000, height: 2000 } } };

describe("the weekly email's catalog", () => {
  it("leaves out what the website leaves out: no id, title, date or description", () => {
    const full = { id: "a", title: "A", date: "2026-11-10", description: block("On tonight") };
    expect(mapEvent(full)).toMatchObject({ id: "a", seriesId: "a", category: "event" });
    for (const missing of ["id", "title", "date", "description"]) {
      expect(mapEvent({ ...full, [missing]: null })).toBeNull();
    }
  });

  it("gives a promotion's nights their series' category", () => {
    const { occurrences } = mapCatalog(
      [{ id: "deal", title: "Deal", category: "promotion" }],
      [{ id: "n", title: "Deal", date: "2026-11-10", seriesId: "deal", description: block("x") }],
    );
    expect(occurrences[0].category).toBe("promotion");
  });

  it("marks a flyer whole, and frames a photo by its crop and focal point", () => {
    expect(pictureUrl({ fit: "whole", asset })).toBe("https://cdn.sanity.io/images/p/d/abc-1000x2000.jpg#whole");
    const framed = new URL(
      pictureUrl({ asset, crop: { top: 0.5, bottom: 0, left: 0, right: 0 }, hotspot: { x: 0.5, y: 0.75 } }),
    );
    expect(framed.searchParams.get("rect")).toBe("0,1000,1000,1000");
    expect(framed.searchParams.get("fp-y")).toBe("0.500");
    expect(pictureUrl(null)).toBe("");
  });

  it("reads published documents only, with GETs", async () => {
    const calls = [];
    const send = async (url, init) => {
      calls.push({ url: new URL(url), init });
      return { ok: true, json: async () => ({ result: [] }) };
    };
    const catalog = await fetchWeeklyCatalog({ projectId: "testproj", token: "t", fetch: send });
    expect(catalog).toEqual({ series: [], occurrences: [] });
    expect(calls).toHaveLength(2);
    for (const { url, init } of calls) {
      expect(url.hostname).toBe("testproj.api.sanity.io");
      expect(url.searchParams.get("perspective")).toBe("published");
      expect(init.method).toBe("GET");
    }
  });

  it("says so when Sanity refuses", async () => {
    const send = async () => ({ ok: false, status: 401 });
    await expect(fetchWeeklyCatalog({ projectId: "testproj", fetch: send })).rejects.toThrow(/401/);
  });
});
