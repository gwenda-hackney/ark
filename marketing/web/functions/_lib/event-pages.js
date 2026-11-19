/**
 * Event pages rendered on request (#25): `/whats-on/<series>`. They read Sanity on
 * each request (through the API CDN), so Update website in ops shows on them
 * within a minute, with no site build, and a new web address works at once.
 *
 * The build makes a shell page (src/pages/whats-on/series-shell.astro) with
 * placeholder tokens; this fills it in for one series. The same code
 * runs in the Pages Function (functions/whats-on/[[path]].js) and the dev
 * server (astro.config.mjs).
 */
import { escapeHtml } from "../../src/lib/event-card.js";
import {
  eventPageModel,
  renderEventPage as renderEventBody,
} from "../../src/lib/event-page.js";
import { londonToday } from "../../src/lib/london-day.js";
import { categoryOf } from "../../src/lib/promotions.js";
import { diaryCacheControl } from "./event-feed.js";
import { buildSeriesDetail, seriesRedirects } from "./event-series.js";
import { richToPlain } from "./rich-text.js";
import { fetchPublishedCatalog } from "./sanity-events.js";

/** The built shell. Visiting it directly goes to What's on. */
export const SERIES_SHELL = "/whats-on/series-shell";

/**
 * Pages under /whats-on that are gone, and where they went for good: the
 * old schedule listed what What's on lists, week by week (#240).
 */
const MOVED_PAGES = new Map([["schedule", "/whats-on/"]]);

const TOKENS = {
  title: "__EVENT_TITLE__",
  description: "__EVENT_DESCRIPTION__",
  eyebrow: "__EVENT_EYEBROW__",
  kind: "__EVENT_KIND__",
};
const BODY = /<series-body>([\s\S]*?)<\/series-body>/;
const PART = /<series-part name="([^"]*)"[^>]*>([\s\S]*?)<\/series-part>/g;

/**
 * What only the build knows, cut out of the shell by name: Book a table's
 * words when bookings are on (the button is the night's own, lib/event-page.js),
 * a guest chef's mark, where a pop-up's menu is, each contact form's
 * button
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

/**
 * What to send for a path under /whats-on: `{ redirect, status }` or
 * `{ shell, fill }` for renderEventPage; `null` when it isn't an event page,
 * or is under an address that was never a series, for the static site to
 * answer: it has no such page either, so that is its "Nothing here" page
 * with a 404 (src/pages/404.astro), not home.
 */
export async function resolveEventPage(env, pathname) {
  if (!pathname.startsWith("/whats-on/")) return null;
  const parts = pathname
    .replace(/\/+$/, "")
    .split("/")
    .slice(2)
    .map(decodeURIComponent);
  if (parts.length !== 1) return null;
  if (parts.length === 1 && MOVED_PAGES.has(parts[0]))
    return { redirect: MOVED_PAGES.get(parts[0]), status: 301 };
  if (`/whats-on/${parts[0]}` === SERIES_SHELL)
    return { redirect: "/whats-on/", status: 302 };
  return resolveSeries(env, parts[0]);
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
    if (moved) return { redirect: `/whats-on/${moved.to}/`, status: 301 };
    // A series that has had its last night: what's on now instead.
    const known =
      series.some((row) => row.seriesId === seriesId) ||
      occurrences.some((night) => night.seriesId === seriesId);
    return known ? { redirect: "/whats-on/", status: 302 } : null;
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
        // "when"; its own link, for a series with no night to carry one; and
        // a pop-up kitchen's logo from ops (#296).
        {
          ...detail,
          schedule: record?.schedule || detail.schedule,
          pageUrl: record?.pageUrl || "",
          logo: record?.logo || null,
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
