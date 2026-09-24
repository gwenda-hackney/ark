/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyHomeArtist,
  applyHomeNext,
  earliestDiaryNight,
  initHomeNext,
  readsLiveDiary,
  initWhatsOnPage,
} from "./whats-on.js";

describe("readsLiveDiary", () => {
  it("refreshes the diary on every deployed site", () => {
    expect(readsLiveDiary("local")).toBe(true);
    expect(readsLiveDiary("staging")).toBe(true);
    expect(readsLiveDiary("production")).toBe(true);
    expect(readsLiveDiary("")).toBe(false);
  });
});

describe("initWhatsOnPage", () => {
  beforeEach(() => {
    document.documentElement.dataset.siteEnv = "local";
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

  it("marks the diary live-ready after a local refresh", async () => {
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
    expect(labels).toEqual(["Special events", "Regular events"]);
    expect(
      [...(content?.querySelectorAll(".whats-on-group-tagline") || [])].map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "A single date, announced once.",
      "Nights that keep their evening, and return.",
    ]);
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
    expect(titles).toEqual(["Amos Mas", "Radio Gwenda"]);
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

  it("puts their page on the card without nesting it in the diary link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nights: [
            {
              title: "Amo más",
              href: "/whats-on/amo-mas",
              date: "2026-10-18",
              description: "Sunday, from four.",
              schedule: "once",
              scheduleLabel: "Sun 18 Oct",
              pageUrl: "https://partiful.com/e/example",
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
    const card = content?.querySelector(".event-card");
    expect(card?.tagName).toBe("DIV");
    expect(card?.querySelector(".event-card-hit")?.getAttribute("href")).toBe(
      "/whats-on/amo-mas",
    );
    const page = card?.querySelector(".event-page-link a");
    expect(page?.textContent).toBe("Partiful");
    expect(page?.getAttribute("href")).toBe("https://partiful.com/e/example");
    expect(page?.getAttribute("target")).toBe("_blank");
    expect(card?.querySelector("a.event-card")).toBeNull();
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

describe("home next night", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.siteEnv;
  });

  it("picks the earliest dated night", () => {
    expect(
      earliestDiaryNight([
        { title: "Later", date: "2026-10-02" },
        { title: "Soon", date: "2026-09-26" },
        { title: "", date: "2026-09-20" },
      ])?.title,
    ).toBe("Soon");
  });

  it("replaces the baked callout from the live diary", async () => {
    document.documentElement.dataset.siteEnv = "production";
    document.body.innerHTML = `
      <article data-home-next>
        <p class="what-we-do-next-name">Last night</p>
        <p class="what-we-do-next-meta"><time datetime="2026-09-20">Sat 20 Sep</time></p>
        <a class="what-we-do-cta" href="/whats-on">What's on</a>
      </article>
    `;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          nights: [
            { title: "Radio Gwenda", date: "2026-09-28" },
            { title: "Negroni Knights", date: "2026-09-30" },
          ],
        }),
      })),
    );

    initHomeNext();
    await vi.waitFor(() => {
      expect(document.querySelector(".what-we-do-next-name")?.textContent).toBe(
        "Radio Gwenda",
      );
    });
    const meta = document.querySelector(".what-we-do-next-meta");
    expect(meta?.textContent).toBe("Mon 28 Sep");
    expect(meta?.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-28");
    expect(document.querySelector(".what-we-do-cta")?.nextElementSibling).toBeNull();
  });

  it("clears the night line when nothing is still ahead", () => {
    document.body.innerHTML = `
      <article data-home-next>
        <p class="what-we-do-next-name">Old</p>
        <p class="what-we-do-next-meta">Sat 20 Sep</p>
      </article>
    `;
    applyHomeNext(document.querySelector("[data-home-next]"), null);
    expect(document.querySelector(".what-we-do-next-name")?.textContent).toBe("");
    expect(document.querySelector(".what-we-do-next-meta")?.textContent).toBe("");
  });

  it("shows the artist's months on the second line", () => {
    document.body.innerHTML = `
      <article data-home-artist>
        <p class="what-we-do-next-name"></p>
        <p class="what-we-do-next-meta"></p>
      </article>
    `;
    applyHomeArtist(document.querySelector("[data-home-artist]"), {
      name: "Rita Matos",
      startMonth: "9",
      endMonth: "10",
    });
    expect(document.querySelector(".what-we-do-next-name")?.textContent).toBe(
      "Rita Matos",
    );
    expect(document.querySelector(".what-we-do-next-meta")?.textContent).toBe(
      "Sept to Oct",
    );
  });
});
