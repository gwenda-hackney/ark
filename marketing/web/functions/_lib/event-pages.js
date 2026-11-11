/**
 * Event pages rendered on request (#25): `/whats-on/<series>`, its nights
 * `/whats-on/<series>/<date>` and their `/ticket` pages. They read Sanity on
 * each request (through the API CDN), so Update website in ops shows on them
 * within a minute, with no site build, and a new web address works at once.
 *
 * The build makes one shell page per kind (src/pages/whats-on/series-shell…)
 * with placeholder tokens; this fills a shell in for one event. The same code
 * runs in the Pages Function (functions/whats-on/[[path]].js) and the dev
 * server (astro.config.mjs).
 */
import { createImageUrlBuilder } from "@sanity/image-url";
import { escapeHtml, renderGallery } from "../../src/lib/event-card.js";
import {
  eventPageModel,
  renderEventPage as renderEventBody,
} from "../../src/lib/event-page.js";
import { londonToday } from "../../src/lib/london-day.js";
import { categoryOf } from "../../src/lib/promotions.js";
import { diaryCacheControl } from "./event-feed.js";
import {
  buildSeriesDetail,
  nightPagePaths,
  seriesGallery,
  seriesRedirects,
} from "./event-series.js";
import { portableTextToRich, richToPlain } from "./rich-text.js";
import {
  sanityDatasetForEnv,
  sanityProjectId,
  sanityQuery,
} from "./sanity-query.js";
import { fetchPublishedCatalog } from "./sanity-events.js";

/** Built shells. Visiting one directly finds no such series and goes to What's on. */
export const SERIES_SHELL = "/whats-on/series-shell";
export const NIGHT_SHELL = "/whats-on/series-shell/night-shell";
export const TICKET_SHELL = `${NIGHT_SHELL}/ticket`;

/** Static pages under /whats-on that are not a series. */
const STATIC_PAGES = new Set(["schedule"]);

const TOKENS = {
  title: "__EVENT_TITLE__",
  description: "__EVENT_DESCRIPTION__",
  eyebrow: "__EVENT_EYEBROW__",
  kind: "__EVENT_KIND__",
  slug: "__EVENT_SLUG__",
};
const BODY = /<series-body>([\s\S]*?)<\/series-body>/;
const PART = /<series-part name="([^"]*)"[^>]*>([\s\S]*?)<\/series-part>/g;

/**
 * What only the build knows, cut out of the shell by name: Book a table's
 * words when bookings are on (the button is the night's own, lib/event-page.js),
 * the logo, a guest chef's mark, where a pop-up's menu is, each contact
 * form's button
 * (src/pages/whats-on/series-shell.astro writes them, lib/event-page.js
 * places them).
 */
function shellParts(html) {
  const parts = new Map();
  const rest = html.replace(PART, (_all, name, inner) => {
    parts.set(
      name
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
      inner.trim(),
    );
    return "";
  });
  return { parts, rest };
}

const NIGHT_PAGES_QUERY = `{
  "events": *[_type == "event" && defined(slug.current) && removed != true] {
    "slug": slug.current, title, date, seriesId, description,
    "hasImage": defined(heroImage.asset)
  },
  "series": *[_type == "eventSeries"] {
    "seriesId": slug.current,
    formerSlugs,
    "gallery": gallery[defined(date)]{ date, alt, "url": asset->url, "width": asset->metadata.dimensions.width, "height": asset->metadata.dimensions.height, "lqip": asset->metadata.lqip, "color": asset->metadata.palette.dominant.background }
  }
}`;

const HERO_IMAGE_QUERY = `*[_type == "event" && slug.current == $slug && removed != true][0].heroImage { crop, hotspot, asset }`;

/**
 * What to send for a path under /whats-on: `null` when it isn't an event
 * page, else `{ redirect, status }` or `{ shell, fill }` for renderEventPage.
 */
export async function resolveEventPage(env, pathname) {
  if (!pathname.startsWith("/whats-on/")) return null;
  const parts = pathname
    .replace(/\/+$/, "")
    .split("/")
    .slice(2)
    .map(decodeURIComponent);
  if (!parts.length || parts.length > 3 || STATIC_PAGES.has(parts[0]))
    return null;
  if (parts.length === 3 && parts[2] !== "ticket") return null;
  if (parts.length === 1) return resolveSeries(env, parts[0]);
  return resolveNight(env, parts[0], parts[1], parts.length === 3);
}

async function resolveSeries(env, seriesId) {
  const { occurrences, series } = await fetchPublishedCatalog(env);
  const detail = buildSeriesDetail(occurrences, seriesId, {
    // Every day of an event on the one page (the feed's most).
    limit: 24,
    series,
  });
  if (!detail) {
    // A web address changed in ops: the old one leads to the series.
    const moved = seriesRedirects(series).find((row) => row.from === seriesId);
    return moved
      ? { redirect: `/whats-on/${moved.to}/`, status: 301 }
      : { redirect: "/whats-on/", status: 302 };
  }
  const record = series.find((row) => row.seriesId === detail.seriesId);
  const nights = occurrences
    .filter((night) => night.seriesId === detail.seriesId)
    .sort((x, y) => String(x.date).localeCompare(String(y.date)));
  // A night follows its series; one written before ops had categories keeps its own.
  const category =
    categoryOf(record) !== "event"
      ? categoryOf(record)
      : categoryOf(detail.nights[0]);
  return {
    shell: SERIES_SHELL,
    fill: (html) => {
      const { parts, rest } = shellParts(html);
      const pending = BODY.exec(rest)?.[1] || "";
      const model = eventPageModel(
        // The series' own line of days and its fixed-run flag, for a pop-up's
        // "when"; and its own link, for a series with no night to carry one.
        {
          ...detail,
          schedule: record?.schedule || detail.schedule,
          pageUrl: record?.pageUrl || "",
        },
        { category, nights, today: londonToday(), parts },
      );
      const body = renderEventBody(model, { pending });
      return fillShell(
        rest.replace(BODY, () => body),
        {
          path: [SERIES_SHELL, `/whats-on/${detail.seriesId}`],
          values: {
            [TOKENS.title]: detail.title,
            [TOKENS.description]: seriesSummary(
              richToPlain(detail.description),
            ),
            [TOKENS.eyebrow]: model.kicker,
            [TOKENS.kind]: model.kind,
          },
        },
      );
    },
  };
}

async function resolveNight(env, seriesId, date, ticket) {
  const data = (await sanityQuery(env, NIGHT_PAGES_QUERY)) || {};
  const events = (data.events || [])
    .map((event) => ({
      ...event,
      description: portableTextToRich(event.description),
    }))
    .filter(
      (event) =>
        event.slug && event.title?.trim() && event.description && event.date,
    );
  const { pages, redirects } = nightPagePaths(events, data.series || []);
  const page = pages.find(
    (row) => row.series === seriesId && row.date === date,
  );
  if (!page) {
    // The series' web address changed in ops: old night links still work.
    const moved = redirects.find(
      (row) => row.series === seriesId && row.date === date,
    );
    if (moved)
      return {
        redirect: `${moved.to}${ticket ? "/ticket" : ""}/`,
        status: 301,
      };
    return { redirect: `/whats-on/${seriesId}/`, status: 302 };
  }
  const { event } = page;
  // The night's own photos from the series gallery (#30).
  const photos = seriesGallery(
    (data.series || []).find((row) => row.seriesId === page.series)?.gallery,
  ).filter((image) => image.date === page.date);
  return {
    shell: ticket ? TICKET_SHELL : NIGHT_SHELL,
    fill: (html) =>
      fillShell(event.hasImage ? html : withoutShareImage(html), {
        path: [NIGHT_SHELL, `/whats-on/${page.series}/${page.date}`],
        values: {
          [TOKENS.title]: event.title.trim(),
          [TOKENS.description]: socialDescription(
            richToPlain(event.description),
          ),
          [TOKENS.slug]: event.slug,
        },
        html: {
          "<night-gallery></night-gallery>": photos?.length
            ? `<div class="event-rsvp-gallery">${renderGallery(photos, { title: event.title.trim() })}</div>`
            : "",
        },
      }),
  };
}

/**
 * Serve an event page. `loadShell(path)` returns the built shell's HTML:
 * the static asset in production, the dev server's page locally.
 */
export async function renderEventPage(env, pathname, loadShell) {
  const page = await resolveEventPage(env, pathname);
  if (!page) return null;
  if (page.redirect) {
    return new Response(null, {
      status: page.status,
      headers: {
        Location: page.redirect,
        "Cache-Control": diaryCacheControl(env),
      },
    });
  }
  const html = page.fill(await loadShell(`${page.shell}/`));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": diaryCacheControl(env),
    },
  });
}

/**
 * Replace tokens in a shell: HTML-escaped in the page, JSON-escaped inside
 * structured data. `path` swaps the shell's own address (canonical, og:url,
 * back links) for the event's.
 */
export function fillShell(source, { path, values = {}, html = {} }) {
  const swap = (text, escape) => {
    let out = text.split(path[0]).join(path[1]);
    for (const [token, value] of Object.entries(values)) {
      out = out.split(token).join(escape(String(value ?? "")));
    }
    return out;
  };
  let out = source
    .split(/(<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>)/)
    .map((part, index) =>
      index % 2
        ? swap(part, (value) =>
            JSON.stringify(value).slice(1, -1).replace(/</g, "\\u003c"),
          )
        : swap(part, escapeHtml),
    )
    .join("");
  for (const [token, value] of Object.entries(html))
    out = out.split(token).join(value);
  return out;
}

/** A night without a hero image has no share image of its own. */
function withoutShareImage(html) {
  return html.replace(
    /<meta (?:property="og:image[^"]*"|name="twitter:image[^"]*")[^>]*>/g,
    "",
  );
}

/** Meta description for a series page: the first paragraph, cut to 155. */
function seriesSummary(description) {
  return (
    String(description || "")
      .split(/\n{2,}/)[0]
      ?.slice(0, 155) || ""
  );
}

/** Trim plain text for meta descriptions without cutting mid-word. */
export function socialDescription(text, maxLength = 160) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6)
    return `${clipped.slice(0, lastSpace).trim()}…`;
  return `${clipped.trim()}…`;
}

/**
 * A night's share image, `/og/events/<slug>.jpg`: its hero cropped to
 * 1200×630 JPEG. WhatsApp and other scrapers prefer a same-origin JPEG.
 */
export async function eventOgImage(env, slug) {
  const image = await sanityQuery(env, HERO_IMAGE_QUERY, { slug });
  if (!image?.asset?._ref) return new Response("Not found", { status: 404 });
  const url = createImageUrlBuilder({
    projectId: sanityProjectId(env),
    dataset: sanityDatasetForEnv(env),
  })
    .image(image)
    .width(1200)
    .height(630)
    .fit("crop")
    .format("jpg")
    .quality(85)
    .url();
  const upstream = await fetch(url);
  if (!upstream.ok) return new Response("Image unavailable", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
