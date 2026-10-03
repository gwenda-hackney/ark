import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NIGHT_SHELL,
  SERIES_SHELL,
  TICKET_SHELL,
  eventOgImage,
  renderEventPage,
  socialDescription,
} from "./event-pages.js";

const env = { SITE_ENV: "production" };
const ORIGIN = "https://gwenda.co.uk";

const SHELLS = {
  [`${SERIES_SHELL}/`]: `<html><head><title>__EVENT_TITLE__ · Gwenda</title>
<meta name="description" content="__EVENT_DESCRIPTION__">
<link rel="canonical" href="${ORIGIN}${SERIES_SHELL}/">
<script type="application/ld+json">{"name":"__EVENT_TITLE__ · Gwenda"}</script></head>
<body><main class="whats-on-series-page __EVENT_LAYOUT__"><a href="/whats-on">Back</a>
<p class="section-eyebrow">__EVENT_EYEBROW__</p><h1>__EVENT_TITLE__</h1>
<div class="page-header-lead"><series-lead></series-lead></div>
<series-body><section class="whats-on-series-pending">Check back soon</section></series-body></main></body></html>`,
  [`${NIGHT_SHELL}/`]: `<html><head><title>__EVENT_TITLE__ · Gwenda</title>
<meta property="og:url" content="${ORIGIN}${NIGHT_SHELL}">
<meta property="og:image" content="${ORIGIN}/og/events/__EVENT_SLUG__.jpg">
<meta name="twitter:image" content="${ORIGIN}/og/events/__EVENT_SLUG__.jpg">
</head><body data-occurrence-slug="__EVENT_SLUG__"></body></html>`,
  [`${TICKET_SHELL}/`]: `<title>Your ticket · __EVENT_TITLE__ · Gwenda</title>
<meta property="og:url" content="${ORIGIN}${TICKET_SHELL}"><body data-occurrence-slug="__EVENT_SLUG__">`,
};
const loadShell = async (path) => SHELLS[path];

/** Published Sanity, as the queries in event-pages.js and sanity-events.js see it. */
let sanity;
const series = (id, extra = {}) => ({
  id,
  title: "Negroni & Chess",
  schedule: "repeating",
  recurrence: "every week on Tuesday",
  description: "Chess, negronis & <friends>.\n\nSecond paragraph.",
  formerSlugs: [],
  ...extra,
});
const night = (seriesId, date, extra = {}) => ({
  id: `${seriesId}-${date}`,
  slug: `${seriesId}-${date}`,
  title: "Negroni & Chess",
  seriesId,
  date,
  recurrence: "every week on Tuesday",
  description: "Bring a board.",
  hasImage: true,
  ...extra,
});

beforeEach(() => {
  sanity = {
    series: [series("negroni-chess", { formerSlugs: ["negroni-night"] })],
    events: [night("negroni-chess", "2099-01-06")],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const query = new URL(String(input)).searchParams.get("query") || "";
      let result;
      if (query.includes('"events":')) {
        result = {
          events: sanity.events,
          series: sanity.series.map((row) => ({
            seriesId: row.id,
            formerSlugs: row.formerSlugs,
          })),
        };
      } else if (query.includes('_type == "eventSeries"'))
        result = sanity.series;
      else if (query.includes("heroImage {")) result = sanity.heroImage ?? null;
      else result = sanity.events;
      return new Response(JSON.stringify({ result }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const render = (path) => renderEventPage(env, path, loadShell);

describe("series page", () => {
  it("shows what was published, at the series' own address", async () => {
    const response = await render("/whats-on/negroni-chess");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    const html = await response.text();
    expect(html).toContain("<title>Negroni &amp; Chess · Gwenda</title>");
    expect(html).toContain(`href="${ORIGIN}/whats-on/negroni-chess/"`);
    expect(html).toContain('{"name":"Negroni & Chess · Gwenda"}');
    expect(html).toContain("Every Tuesday");
    expect(html).toContain('id="series-nights" data-series-id="negroni-chess"');
    expect(html).not.toContain("__EVENT_");
    expect(html).not.toContain("series-body>");
    expect(html).not.toContain("Check back soon");
  });

  it("sends a former web address to the new one straight away", async () => {
    const response = await render("/whats-on/negroni-night/");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe("/whats-on/negroni-chess");
  });

  it("sends an unknown address to What's on, not the homepage", async () => {
    const response = await render("/whats-on/no-such-series");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/whats-on");
  });

  it("leaves the static schedule page and other paths alone", async () => {
    expect(await render("/whats-on/schedule/")).toBeNull();
    expect(await render("/menu")).toBeNull();
    expect(await render("/whats-on/a/b/c")).toBeNull();
  });
});

describe("night and ticket pages", () => {
  it("fills in the night, with its share image", async () => {
    const html = await (
      await render("/whats-on/negroni-chess/2099-01-06")
    ).text();
    expect(html).toContain('data-occurrence-slug="negroni-chess-2099-01-06"');
    expect(html).toContain(
      `content="${ORIGIN}/whats-on/negroni-chess/2099-01-06"`,
    );
    expect(html).toContain("/og/events/negroni-chess-2099-01-06.jpg");
  });

  it("leaves out the share image when the night has none", async () => {
    sanity.events = [night("negroni-chess", "2099-01-06", { hasImage: false })];
    const bare = await (
      await render("/whats-on/negroni-chess/2099-01-06")
    ).text();
    expect(bare).not.toContain("og:image");
    expect(bare).not.toContain("twitter:image");
  });

  it("serves the ticket page under the night", async () => {
    const html = await (
      await render("/whats-on/negroni-chess/2099-01-06/ticket")
    ).text();
    expect(html).toContain(
      "<title>Your ticket · Negroni &amp; Chess · Gwenda</title>",
    );
    expect(html).toContain(
      `${ORIGIN}/whats-on/negroni-chess/2099-01-06/ticket"`,
    );
  });

  it("redirects a night under the series' former address", async () => {
    const response = await render("/whats-on/negroni-night/2099-01-06/ticket");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "/whats-on/negroni-chess/2099-01-06/ticket",
    );
  });

  it("sends a night that isn't on the website to its series", async () => {
    const response = await render("/whats-on/negroni-chess/2099-02-01");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/whats-on/negroni-chess");
  });
});

describe("share image", () => {
  it("is not found for a night without a hero image", async () => {
    expect((await eventOgImage(env, "negroni-chess-2099-01-06")).status).toBe(
      404,
    );
  });
});

describe("socialDescription", () => {
  it("returns short text unchanged", () => {
    expect(socialDescription("Launch party at Gwenda.")).toBe(
      "Launch party at Gwenda.",
    );
  });

  it("truncates long copy on a word boundary", () => {
    const long =
      "We're hosting a private launch party to celebrate the opening of Gwenda, and we'd love for you to come join us. Free signature cocktail from 5 to 7pm, music, and friends.";
    const result = socialDescription(long);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("…")).toBe(true);
  });
});
