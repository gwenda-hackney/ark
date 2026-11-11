/**
 * The weekly "what's on" email, as data: this week's nights, the deals, the
 * pop-up kitchen, and a few of next week's. No HTML here (render.js).
 *
 * It runs the website's own What's on rules over the same catalog, so the
 * email and the page say the same thing: nights only (lib/promotions.js),
 * one entry for an event over several days (lib/night-cards.js nightRuns), a
 * deal and a pop-up kitchen once each, weeks Monday to Sunday in London.
 *
 * The cards themselves (which title, which line, which picture) follow
 * components/chart/NightCards.astro and StandingCards.astro, where that
 * logic lives inside the components today.
 */
import { siteConfig } from "../../marketing/web/src/config/site.ts";
import { bookingUrl } from "../../marketing/web/src/config/booking.ts";
import { formatEventSpan } from "../../marketing/web/src/data/events.ts";
import { isWholeFit } from "../../marketing/web/functions/_lib/sanity-image-url.js";
import { daysAway, weekStart } from "../../marketing/web/src/lib/london-day.js";
import { nightDay, nightRuns, runDay, runTimes } from "../../marketing/web/src/lib/night-cards.js";
import { popupKitchens } from "../../marketing/web/src/lib/popup-kitchen.js";
import { nightsOnly, promotionDeals } from "../../marketing/web/src/lib/promotions.js";

/** How many of next week's nights are named before "and N more". */
const NEXT_WEEK_SHOWN = 6;

function addDays(dateIso, days) {
  const [year, month, day] = String(dateIso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** "11 to 15 Nov", "30 Nov to 6 Dec", "15 Nov" for one day. */
function daysSpan(fromIso, toIso) {
  const from = nightDay(fromIso);
  const to = nightDay(toIso);
  if (fromIso === toIso) return `${to.day} ${to.month}`;
  if (from.month === to.month) return `${from.day} to ${to.day} ${to.month}`;
  return `${from.day} ${from.month} to ${to.day} ${to.month}`;
}

/** A page on the site, in full: email has no "this site". */
function absolute(origin, path) {
  const value = String(path || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  return `${origin}${value.startsWith("/") ? "" : "/"}${value}`;
}

/** A picture and whether it's a flyer ops says never to crop; null with none. */
function photoOf(url, alt) {
  const value = String(url || "").trim();
  if (!value) return null;
  return { url: value.replace(/#.*$/, ""), whole: isWholeFit(value), alt };
}

/** "One event, 12–8pm": the clock for a deal or a kitchen. */
function whenLine(days, row) {
  return [days, formatEventSpan(row.startTime, row.endTime, row.time)].filter(Boolean).join(", ");
}

/**
 * The nights as What's on has them (NightCards.astro): every night to come,
 * an event over several days in a row as one, each with its sticker, name,
 * hours, line, offer and page.
 */
function nightCards(occurrences, series, todayIso, origin) {
  const dated = nightsOnly(occurrences)
    .filter((night) => night.title && night.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return nightRuns(dated, series)
    .map((run) => {
      const days = run.indexes.map((index) => dated[index]);
      const [night] = days;
      const title =
        days.length > 1
          ? night.seriesTitle || night.title
          : night.seriesTitle && night.title !== night.seriesTitle
            ? night.title
            : night.seriesTitle || night.title;
      return {
        start: run.start,
        end: run.end,
        sticker: runDay(run.start, run.end),
        /** On the day the email goes out: the red sticker, "Tonight". */
        tonight: run.start <= todayIso && todayIso <= run.end,
        title,
        /** The hours, day by day where they differ: "Sat 12–8pm", "Sun 1–6pm". */
        times: runTimes(
          days.map((day) => ({
            date: day.date,
            span: formatEventSpan(day.startTime, day.endTime, day.time),
          })),
        ),
        note: night.shortDescription || night.artist || "",
        offer: night.offer || "",
        photo: photoOf(night.seriesHeroImageUrl || night.heroImage?.url, title),
        href: absolute(origin, night.seriesId ? `/whats-on/${encodeURIComponent(night.seriesId)}` : "/whats-on"),
      };
    })
    .filter((card) => daysAway(card.end, todayIso) >= 0);
}

/**
 * Until ops holds a pop-up's line and link, the guest chef named in the
 * site's settings fills them in, for that chef only (StandingCards.astro).
 */
function guestFallback(title) {
  const { guestChef } = siteConfig;
  return String(title).trim().toLowerCase() === guestChef.name.trim().toLowerCase() ? guestChef : null;
}

/**
 * @param {object} catalog what the website's What's on is built from
 * @param {object[]} catalog.occurrences every night, each with its series' category
 * @param {object[]} [catalog.series]
 * @param {object[]} [catalog.chapters] the kitchen menu's chapters, for a
 *   pop-up's own place on the food page; the food page itself without
 * @param {object} options
 * @param {string} options.today the day it goes out, in London: YYYY-MM-DD
 *   (lib/london-day.js londonToday)
 * @param {string} [options.origin] where the links go; the live site unless a
 *   preview points somewhere else
 */
export function weeklyEmailModel(catalog, { today, origin = siteConfig.domain } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) {
    throw new Error("weeklyEmailModel needs today as YYYY-MM-DD (London)");
  }
  const site = String(origin).replace(/\/+$/, "");
  const series = catalog?.series || [];
  const occurrences = catalog?.occurrences || [];
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  const nextMonday = addDays(monday, 7);

  const cards = nightCards(occurrences, series, today, site);
  // A night is in the week of its first day; one still running from last week is on now.
  const nights = cards.filter((card) => weekStart(card.start) <= monday);
  const following = cards.filter((card) => weekStart(card.start) === nextMonday);

  const deals = promotionDeals(series, occurrences, today).map((deal) => ({
    title: deal.title,
    when: whenLine(deal.days, deal),
    note: deal.note,
    offer: deal.offer,
    photo: photoOf(deal.photo, deal.title),
    href: absolute(site, deal.href),
  }));

  const kitchens = popupKitchens(series, occurrences, catalog?.chapters || [], today).map((kitchen) => {
    const fallback = guestFallback(kitchen.title);
    const page = kitchen.pageUrl || fallback?.instagram || "";
    return {
      title: kitchen.title,
      when: whenLine(kitchen.when, kitchen),
      note: kitchen.note || fallback?.line || "",
      photo: photoOf(kitchen.photo, kitchen.title),
      href: absolute(site, kitchen.href),
      links: [
        { href: absolute(site, kitchen.menuHref), text: "See the menu" },
        ...(page ? [{ href: page, text: /instagram\.com/i.test(page) ? "Instagram" : "Their page" }] : []),
      ],
    };
  });

  return {
    today,
    week: { start: monday, end: sunday, span: daysSpan(today, sunday) },
    nights,
    deals,
    kitchens,
    nextWeek: {
      start: nextMonday,
      span: daysSpan(nextMonday, addDays(nextMonday, 6)),
      nights: following.slice(0, NEXT_WEEK_SHOWN).map((card) => ({
        sticker: card.sticker,
        title: card.title,
        times: card.times,
        href: card.href,
      })),
      more: Math.max(0, following.length - NEXT_WEEK_SHOWN),
    },
    site: {
      name: siteConfig.name,
      social: siteConfig.copy.social,
      origin: site,
      whatsOn: absolute(site, "/whats-on"),
      booking: bookingUrl,
      bookingLabel: siteConfig.copy.bookingCta,
      instagram: siteConfig.social.instagram,
      address: siteConfig.location.address,
      mapsUrl: siteConfig.location.mapsUrl,
    },
  };
}
