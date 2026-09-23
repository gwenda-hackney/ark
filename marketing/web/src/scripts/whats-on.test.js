/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readsLiveDiary, initWhatsOnPage } from "./whats-on.js";

describe("readsLiveDiary", () => {
  it("refreshes the diary only on staging", () => {
    expect(readsLiveDiary("staging")).toBe(true);
    expect(readsLiveDiary("production")).toBe(false);
    expect(readsLiveDiary("")).toBe(false);
  });
});

describe("initWhatsOnPage", () => {
  beforeEach(() => {
    document.documentElement.dataset.siteEnv = "staging";
    document.body.innerHTML = `
      <p id="whats-on-loading">Looking at the diary…</p>
      <section id="whats-on-empty" hidden></section>
      <div id="whats-on-content">
        <ol class="events-list whats-on-series-list">
          <li><a class="event-card event-card--series" href="/whats-on/negroni-knights"><h2 class="event-title">Negroni Knights</h2></a></li>
        </ol>
      </div>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.siteEnv;
  });

  it("marks the diary live-ready after a staging refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nights: [
            {
              title: "Negroni Knights",
              href: "/whats-on/negroni-knights",
              date: "2026-09-29",
              description: "Tuesday.",
              regular: true,
              scheduleLabel: "Every Tuesday",
            },
          ],
          next: null,
        }),
      })),
    );

    initWhatsOnPage();
    const content = document.getElementById("whats-on-content");
    expect(content?.dataset.live).toBe("pending");

    await vi.waitFor(() => {
      expect(content?.dataset.live).toBe("ready");
    });
    expect(content?.querySelectorAll(".event-card")).toHaveLength(1);
    expect(document.getElementById("whats-on-loading")).toBeNull();
  });

  it("labels special events apart from the series", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nights: [
            {
              title: "Radio Gwenda",
              href: "/whats-on/gwenda-radio",
              date: "2026-09-27",
              schedule: "repeating",
              regular: true,
              scheduleLabel: "Every Sunday",
            },
            {
              title: "Amos Mas",
              href: "/whats-on/amos-mas",
              date: "2026-10-18",
              schedule: "once",
              regular: false,
              scheduleLabel: "Sun 18 Oct",
            },
          ],
          next: null,
        }),
      })),
    );

    initWhatsOnPage();
    const content = document.getElementById("whats-on-content");
    await vi.waitFor(() => {
      expect(content?.dataset.live).toBe("ready");
    });
    const labels = [
      ...(content?.querySelectorAll(".whats-on-group-label") || []),
    ].map((node) => node.textContent);
    expect(labels).toEqual(["Series", "Special events"]);
    expect(
      document.getElementById("series")?.classList.contains("whats-on-divider"),
    ).toBe(true);
    expect(
      document
        .getElementById("special")
        ?.classList.contains("whats-on-divider"),
    ).toBe(true);
    const titles = [...(content?.querySelectorAll(".event-title") || [])].map(
      (node) => node.textContent,
    );
    expect(titles).toEqual(["Radio Gwenda", "Amos Mas"]);
  });

  it("keeps the night schedule on the card after the live refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nights: [
            {
              title: "Negroni Knights",
              href: "/whats-on/negroni-night",
              date: "2026-09-29",
              description: "Tuesday.",
              regular: true,
              scheduleLabel: "Every Tuesday",
              nightSchedule: [
                { label: "Open decks", startTime: "16:00", endTime: "22:00" },
                { label: "Chess", startTime: "19:00", endTime: "22:00" },
              ],
            },
          ],
          next: null,
        }),
      })),
    );

    initWhatsOnPage();
    const content = document.getElementById("whats-on-content");
    await vi.waitFor(() => {
      expect(content?.dataset.live).toBe("ready");
    });
    const text = content?.querySelector(".night-schedule")?.textContent || "";
    expect(text).toContain("Open decks");
    expect(text).toContain("Chess");
    expect(text).toContain("4–10pm");
  });

  it("falls back to static cards when the live fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
      })),
    );

    initWhatsOnPage();
    const content = document.getElementById("whats-on-content");

    await vi.waitFor(() => {
      expect(content?.dataset.live).toBe("static");
    });
    expect(content?.querySelectorAll(".event-card")).toHaveLength(1);
  });
});
