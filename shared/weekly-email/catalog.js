/**
 * The weekly email's nights, read from where the website reads them: the
 * same published Sanity documents, by the website's own queries, mapped to
 * the shape its What's on rules take (lib/night-cards.js, lib/promotions.js,
 * lib/popup-kitchen.js). So the email and the page can't disagree about
 * what's on.
 *
 * The website's own loader (marketing/web/src/lib/sanity/events.ts) only
 * runs inside its build (it reads Astro's `import.meta.env`), so the mapping
 * is repeated here, with the same rule for what's left out: a night with no
 * id, title, date or description isn't on the website, and isn't here.
 *
 * Read-only: one GET per query, over the HTTP API, so it runs in Node, a
 * Worker or ops without the Sanity client.
 */
import { portableTextToRich } from "../../marketing/web/functions/_lib/rich-text.js";
import { markWholeFit } from "../../marketing/web/functions/_lib/sanity-image-url.js";
import { withSeriesCategory, categoryOf } from "../../marketing/web/src/lib/promotions.js";
import { EVENTS_QUERY, SERIES_QUERY } from "../../marketing/web/src/lib/sanity/queries.ts";

const API_VERSION = "v2025-01-01";

function text(value) {
  return String(value ?? "").trim();
}

/**
 * A picture's address for the rules and the renderer: the asset as stored,
 * cut to the crop set in Studio (`rect`), aimed at its focal point
 * (`fp-x`/`fp-y`), and marked "#whole" when ops says never crop it (a
 * flyer). No size yet: the renderer asks for the width it shows.
 */
export function pictureUrl(image) {
  const base = text(image?.asset?.url);
  if (!base) return "";
  let url;
  try {
    url = new URL(base);
  } catch {
    return "";
  }
  const whole = image?.fit === "whole";
  const width = Number(image?.asset?.metadata?.dimensions?.width) || 0;
  const height = Number(image?.asset?.metadata?.dimensions?.height) || 0;
  const crop = image?.crop || {};
  const [left, right, top, bottom] = ["left", "right", "top", "bottom"].map((side) =>
    Math.min(1, Math.max(0, Number(crop[side]) || 0)),
  );
  const cropped = !whole && width > 0 && height > 0 && [left, right, top, bottom].some((cut) => cut > 0.001);
  if (cropped) {
    const rect = [left * width, top * height, width * (1 - left - right), height * (1 - top - bottom)];
    url.searchParams.set("rect", rect.map((n) => Math.max(0, Math.round(n))).join(","));
  }
  const x = Number(image?.hotspot?.x);
  const y = Number(image?.hotspot?.y);
  if (!whole && Number.isFinite(x) && Number.isFinite(y)) {
    // The focal point is within what's left after the crop.
    const within = (at, start, end) => {
      const span = 1 - start - end;
      return span > 0 ? Math.min(1, Math.max(0, (at - start) / span)) : 0.5;
    };
    url.searchParams.set("fp-x", within(x, left, right).toFixed(3));
    url.searchParams.set("fp-y", within(y, top, bottom).toFixed(3));
  }
  return markWholeFit(url.toString(), whole ? "whole" : "");
}

function picture(image, fallbackAlt) {
  const url = pictureUrl(image);
  return url ? { url, alt: text(image?.alt) || fallbackAlt } : undefined;
}

/** A night as the website has it; null when the website would leave it out. */
export function mapEvent(doc) {
  const description = portableTextToRich(doc?.description);
  if (!doc?.id || !doc.title || !doc.date || !description) return null;
  return {
    id: doc.id,
    title: doc.title,
    artist: text(doc.artist),
    offer: text(doc.offer),
    pageUrl: text(doc.pageUrl),
    seriesId: text(doc.seriesId) || doc.id,
    seriesTitle: text(doc.seriesTitle),
    category: categoryOf(doc),
    recurrence: text(doc.recurrence),
    time: text(doc.time),
    startTime: text(doc.startTime),
    endTime: text(doc.endTime),
    date: doc.date,
    shortDescription: text(doc.shortDescription),
    heroImage: picture(doc.heroImage, doc.title),
    seriesHeroImageUrl: pictureUrl(doc.seriesHeroImage) || null,
  };
}

/** A series as the website has it; null with no id or title. */
export function mapSeries(doc) {
  if (!doc?.id || !doc.title) return null;
  return {
    seriesId: doc.id,
    title: doc.title,
    category: categoryOf(doc),
    schedule: doc.schedule === "repeating" ? "repeating" : doc.schedule === "once" ? "once" : "manual",
    recurrence: text(doc.recurrence),
    shortDescription: text(doc.shortDescription),
    // Its own link from ops: a pop-up kitchen's Instagram (#296).
    pageUrl: text(doc.pageUrl),
    heroImageUrl: pictureUrl(doc.heroImage) || null,
  };
}

/** What the queries return, as the catalog the model takes. */
export function mapCatalog(seriesDocs, eventDocs) {
  const series = (seriesDocs || []).map(mapSeries).filter(Boolean);
  const occurrences = (eventDocs || []).map(mapEvent).filter(Boolean);
  // A night follows its series: a promotion's nights are promotions.
  return { series, occurrences: withSeriesCategory(occurrences, series) };
}

/**
 * The published What's on catalog of one Sanity project.
 *
 * @param {object} options
 * @param {string} options.projectId production's or dev's (shared/sanity-projects.js)
 * @param {string} [options.dataset]
 * @param {string} [options.token] a read token; left out for a public dataset
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<{ series: object[], occurrences: object[] }>}
 */
export async function fetchWeeklyCatalog({ projectId, dataset = "production", token = "", fetch: send = fetch }) {
  if (!projectId) throw new Error("fetchWeeklyCatalog needs a Sanity projectId");
  async function query(groq) {
    const url = new URL(`https://${projectId}.api.sanity.io/${API_VERSION}/data/query/${dataset}`);
    url.searchParams.set("query", groq);
    // Published only, as the live website: never a draft.
    url.searchParams.set("perspective", "published");
    const response = await send(url, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Sanity ${projectId}/${dataset} answered ${response.status}`);
    }
    const body = await response.json();
    return Array.isArray(body?.result) ? body.result : [];
  }
  const [seriesDocs, eventDocs] = await Promise.all([query(SERIES_QUERY), query(EVENTS_QUERY)]);
  return mapCatalog(seriesDocs, eventDocs);
}
