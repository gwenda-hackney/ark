/**
 * The monthly "what's on" email (weekly until one-off emails could carry
 * the rest), as data: the rest of this month's nights, the deals, the pop-up
 * kitchens, and a few of next month's. No HTML here (render.js).
 *
 * It runs the website's own What's on rules over the same catalog, so the
 * email and the page say the same thing: nights only (lib/promotions.js),
 * one entry for an event over several days (lib/night-cards.js nightRuns), a
 * deal and a pop-up kitchen once each. A month has a series on many nights
 * (karaoke every Thursday), so each series is one card, at its first night,
 * with its other dates that month under it ("Also 11, 18 and 25 Dec").
 *
 * The cards themselves (which title, which line, which picture) follow
 * components/chart/NightCards.astro and StandingCards.astro, where that
 * logic lives inside the components today.
 */
import { siteConfig } from "../../marketing/web/src/config/site.ts";
import { emailSite } from "../email/site.js";
import { bookingUrl } from "../../marketing/web/src/config/booking.ts";
import { formatEventSpan } from "../../marketing/web/src/data/events.ts";
import { isWholeFit } from "../../marketing/web/functions/_lib/sanity-image-url.js";
import { bookingsWords } from "../../marketing/web/src/lib/bookings.js";
import { daysAway } from "../../marketing/web/src/lib/london-day.js";
import { nightDay, nightRuns, runDay, runTimes } from "../../marketing/web/src/lib/night-cards.js";
import { popupKitchens } from "../../marketing/web/src/lib/popup-kitchen.js";
import { nightsOnly, promotionDeals } from "../../marketing/web/src/lib/promotions.js";

/** How many of next month's are named before "and N more". */
const NEXT_MONTH_SHOWN = 6;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-12-17" → "2026-12-01". */
const monthStartOf = (dateIso) => `${String(dateIso).slice(0, 7)}-01`;

/** The first day of the month after a month's first day. */
function nextMonthOf(monthIso) {
  const [year, month] = String(monthIso).split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** "December". */
const monthName = (monthIso) => MONTH_NAMES[Number(String(monthIso).slice(5, 7)) - 1] || "";

/** "11, 18 and 25" */
function listWords(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/**
 * One card a series: its first night, carrying its other nights' dates
 * ("Also 11, 18 and 25 Dec"). A night with no series is a card of its own.
 */
function bySeries(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = card.seriesId || `night:${card.start}:${card.title}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return [...groups.values()].map(([first, ...rest]) => {
    if (!rest.length) return { ...first, also: "" };
    const byMonth = new Map();
    for (const card of rest) {
      const { day, month } = card.sticker;
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(day);
    }
    const also = [...byMonth].map(([month, days]) => `${listWords(days)} ${month}`).join(", ");
    return { ...first, also: `Also ${also}` };
  });
}

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

/** "One event, noon–8pm": the clock for a deal or a kitchen. */
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
        /** The hours, day by day where they differ: "Sat noon–8pm", "Sun 1–6pm". */
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
        seriesId: night.seriesId || "",
      };
    })
    .filter((card) => daysAway(card.end, todayIso) >= 0);
}

/**
 * Bookings, as the website's Bookings page has it (#315): its heading and
 * note, then a party and playing here, each with its heading, line and
 * button to its half of /bookings. The words are the page's own
 * (lib/bookings.js), so a change there changes the email too.
 */
function bookingsSection(origin) {
  const { heading, note, halves } = bookingsWords();
  return {
    heading,
    note,
    halves: halves.map((half) => ({
      id: half.id,
      heading: half.heading,
      line: half.line,
      cta: half.cta,
      href: absolute(origin, half.page),
    })),
  };
}

/**
 * @param {object} catalog what the website's What's on is built from
 * @param {object[]} catalog.occurrences every night, each with its series' category
 * @param {object[]} [catalog.series]
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
  const first = monthStartOf(today);
  const next = nextMonthOf(first);
  const last = addDays(next, -1);

  const cards = nightCards(occurrences, series, today, site);
  // A night is in the month of its first day; one still running from last month is on now.
  const nights = bySeries(cards.filter((card) => card.start < next));
  const following = bySeries(cards.filter((card) => card.start >= next && card.start < nextMonthOf(next)));

  const deals = promotionDeals(series, occurrences, today).map((deal) => ({
    title: deal.title,
    when: whenLine(deal.days, deal),
    note: deal.note,
    offer: deal.offer,
    photo: photoOf(deal.photo, deal.title),
    href: absolute(site, deal.href),
  }));

  // A pop-up's line and its Instagram (its link) are its series' in ops (#296).
  // No menus in the email's catalog: "See the menu" goes to the food page.
  const kitchens = popupKitchens(series, occurrences, new Map(), today).map((kitchen) => {
    const page = kitchen.pageUrl;
    return {
      title: kitchen.title,
      when: whenLine(kitchen.when, kitchen),
      note: kitchen.note,
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
    month: { start: first, end: last, name: monthName(first), span: daysSpan(today, last) },
    nights,
    deals,
    kitchens,
    nextMonth: {
      start: next,
      name: monthName(next),
      nights: following.slice(0, NEXT_MONTH_SHOWN).map((card) => ({
        sticker: card.sticker,
        title: card.title,
        times: card.times,
        also: card.also,
        href: card.href,
      })),
      more: Math.max(0, following.length - NEXT_MONTH_SHOWN),
    },
    bookings: bookingsSection(site),
    site: {
      ...emailSite(site),
      booking: bookingUrl,
      bookingLabel: siteConfig.copy.bookingCta,
    },
  };
}
