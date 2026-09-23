/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { initSchedulePage, renderScheduleList } from "./schedule.js";

describe("renderScheduleList", () => {
  it("writes week headings and night links", () => {
    document.body.innerHTML = `<ol class="schedule-list"></ol>`;
    const list = document.querySelector(".schedule-list");
    renderScheduleList(list, [
      {
        id: "2026-09-21",
        label: "This week · 21 Sep–27 Sep",
        nights: [
          {
            date: "2026-09-23",
            title: "Vbrave Vinyl Session",
            seriesTitle: "Gwenda Nights",
            artist: "",
            startTime: "21:00",
            endTime: "01:00",
            time: "",
            href: "/whats-on/gwenda-nights",
          },
        ],
      },
    ]);
    expect(list.querySelector(".whats-on-group-label")?.textContent).toBe(
      "This week · 21 Sep–27 Sep",
    );
    expect(list.querySelector("h2")?.closest("li")?.id).toBe("week-2026-09-21");
    const link = list.querySelector("a.schedule-row");
    expect(link?.getAttribute("href")).toBe("/whats-on/gwenda-nights");
    expect(link?.querySelector(".schedule-title")?.textContent).toBe(
      "Vbrave Vinyl Session",
    );
    expect(link?.querySelector(".schedule-series")?.textContent).toBe(
      "Gwenda Nights",
    );
    expect(link?.querySelector("time")?.textContent).toBe("Wed 23 Sep");
    expect(link?.textContent).toContain("9pm–1am");
  });
});

describe("initSchedulePage", () => {
  beforeEach(() => {
    document.documentElement.dataset.siteEnv = "staging";
    document.body.innerHTML = `
      <p id="schedule-loading">Looking at the diary…</p>
      <section id="schedule-empty" hidden></section>
      <div id="schedule-content">
        <ol class="schedule-list">
          <li><a class="schedule-row" href="/whats-on/negroni-night">Negroni Night</a></li>
        </ol>
      </div>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.siteEnv;
  });

  it("replaces the baked list with the live schedule on staging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          weeks: [
            {
              id: "2026-09-28",
              label: "Next week · 28 Sep–4 Oct",
              nights: [
                {
                  date: "2026-09-29",
                  title: "Negroni Night",
                  seriesTitle: "",
                  artist: "Ada",
                  startTime: "19:00",
                  endTime: "",
                  href: "/whats-on/negroni-night",
                },
              ],
            },
          ],
        }),
      })),
    );

    initSchedulePage();
    await vi.waitFor(() => {
      expect(document.getElementById("schedule-content")?.dataset.live).toBe(
        "ready",
      );
    });
    expect(document.getElementById("schedule-loading")).toBeNull();
    expect(
      document.getElementById("schedule-empty")?.hasAttribute("hidden"),
    ).toBe(true);
    expect(document.querySelector(".whats-on-group-label")?.textContent).toBe(
      "Next week · 28 Sep–4 Oct",
    );
    expect(document.querySelector(".schedule-meta")?.textContent).toBe(
      "Special guest · Ada",
    );
  });
});
