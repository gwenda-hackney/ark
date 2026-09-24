import {
  eventDescriptionParagraphs,
  eventPageLink,
  formatEventDate,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";
import { formatShortEventDate } from "../../functions/_lib/event-series.js";
import { artistRunLabel } from "../lib/artist-run.js";
import { diaryGroups } from "../lib/diary-groups.js";

function heroImageUrl(event, width) {
  const url = event.heroImageUrl || event.heroImage?.url;
  if (!url) return null;
  // Already framed by Sanity (fit=crop + w/h) — don't append another resize pass
  // that drops rect/hotspot params.
  if (/[?&](rect|fit)=/.test(url)) return url;
  if (/[?&]w=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}&auto=format&q=86`;
}

function eventMedia(event, eager, width = 1200) {
  const url = heroImageUrl(event, width);
  if (!url) {
    const empty = document.createElement("div");
    empty.className = "event-media event-media--empty";
    empty.setAttribute("aria-hidden", "true");
    const mark = document.createElement("span");
    mark.textContent = "Gwenda";
    empty.appendChild(mark);
    return empty;
  }
  const figure = document.createElement("figure");
  figure.className = "event-media";
  const img = document.createElement("img");
  img.className = "event-hero";
  img.src = url;
  img.alt = event.heroImage?.alt || event.heroImageAlt || event.title;
  img.loading = eager ? "eager" : "lazy";
  const position =
    event.heroImage?.objectPosition || event.heroObjectPosition || "";
  if (position) img.style.objectPosition = position;
  figure.appendChild(img);
  const captionName = String(event.imageCaptionName || "").trim();
  if (captionName) {
    const caption = document.createElement("figcaption");
    caption.className = "event-media-caption";
    const kicker = document.createElement("span");
    kicker.className = "event-media-caption-kicker";
    kicker.textContent = String(event.imageCaption || "").trim() || "Hosting";
    const who = document.createElement("span");
    who.className = "event-media-caption-name";
    who.textContent = captionName;
    caption.append(kicker, who);
    figure.appendChild(caption);
  }
  return figure;
}

function openHostJump(event, href) {
  event.preventDefault();
  event.stopPropagation();
  window.location.assign(href);
}

function bindHostJump(line, href) {
  const target = String(href || "").trim();
  if (!target || line.dataset.bound === "true") return;
  line.dataset.bound = "true";
  line.dataset.href = target;
  line.tabIndex = 0;
  line.setAttribute("role", "link");
  line.addEventListener("click", (event) => openHostJump(event, target));
  line.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openHostJump(event, target);
  });
}

function bindHostJumps(root) {
  if (!(root instanceof HTMLElement)) return;
  for (const line of root.querySelectorAll(".event-next[data-href]")) {
    if (line instanceof HTMLElement) bindHostJump(line, line.dataset.href);
  }
}

function teaserLine(label, isoDate, name, href = "") {
  const line = document.createElement("p");
  line.className = "event-next";
  const kicker = document.createElement("span");
  kicker.className = "event-next-label";
  kicker.textContent = label;
  line.appendChild(kicker);
  const when = isoDate ? formatShortEventDate(isoDate) : "";
  if (when) {
    const sep = document.createElement("span");
    sep.className = "event-next-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    const time = document.createElement("time");
    time.dateTime = isoDate;
    time.textContent = when;
    line.append(sep, time);
  }
  const sepName = document.createElement("span");
  sepName.className = "event-next-sep";
  sepName.setAttribute("aria-hidden", "true");
  sepName.textContent = "·";
  const who = document.createElement("span");
  who.className = "event-next-name";
  who.textContent = name;
  line.append(sepName, who);
  if (href) bindHostJump(line, href);
  return line;
}

function nightScheduleBlock(slots) {
  const rows = (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const label = String(slot?.label || "").trim();
      if (!label) return null;
      return {
        label,
        when: formatEventSpan(slot?.startTime, slot?.endTime),
      };
    })
    .filter(Boolean);
  if (!rows.length) return null;
  const block = document.createElement("div");
  block.className = "night-schedule";
  const list = document.createElement("ol");
  list.className = "night-schedule-list";
  for (const row of rows) {
    const item = document.createElement("li");
    if (row.when) {
      const time = document.createElement("span");
      time.className = "night-schedule-time";
      time.textContent = row.when;
      item.appendChild(time);
    }
    const name = document.createElement("span");
    name.className = "night-schedule-item";
    name.textContent = row.label;
    item.appendChild(name);
    list.appendChild(item);
  }
  block.append(list);
  return block;
}

function eventDescription(
  description,
  className = "event-description",
  legacyTime = "",
) {
  const wrap = document.createElement("div");
  wrap.className = className;
  for (const paragraph of eventDescriptionParagraphs(description, legacyTime)) {
    const node = document.createElement("p");
    node.textContent = paragraph;
    wrap.appendChild(node);
  }
  return wrap;
}

function appendPageLink(parent, url) {
  const link = eventPageLink(url);
  if (!link) return;
  const line = document.createElement("p");
  line.className = "event-page-link";
  const anchor = document.createElement("a");
  anchor.href = link.href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = link.label;
  line.appendChild(anchor);
  parent.appendChild(line);
}

/** Home: one basic series card. */
function seriesCard(event, { eager = false } = {}) {
  const regular = Boolean(event.regular);
  const href = String(event.href || "").trim();
  const external = eventPageLink(event.pageUrl);
  const item = document.createElement("li");
  const card = document.createElement(external ? "div" : href ? "a" : "div");
  card.className = `event-card event-card--series${external ? " event-card--linked" : ""}${regular ? " event-card--regular" : ""}`;
  const captionName = String(event.imageCaptionName || "").trim();
  const hostDate = String(event.hostDate || "").trim();
  const label = [
    event.title,
    captionName ? `Hosting ${captionName}` : "",
    hostDate
      ? `${event.hostThisWeek ? "This week, " : ""}${formatShortEventDate(hostDate)}`
      : "",
    String(event.thisWeekName || "").trim()
      ? `This week, ${event.thisWeekName}`
      : "",
    String(event.upcomingName || "").trim()
      ? `Next, ${event.upcomingName}`
      : "",
    captionName ? `Next at Gwenda, ${captionName}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  if (external && href) {
    const hit = document.createElement("a");
    hit.className = "event-card-hit";
    hit.href = href;
    hit.setAttribute("aria-label", label);
    card.appendChild(hit);
  } else if (href) {
    card.href = href;
    card.setAttribute("aria-label", label);
  }

  card.appendChild(eventMedia(event, eager, 960));

  const copy = document.createElement("article");
  copy.className = "event-copy";

  const date = document.createElement("p");
  date.className = "event-date";
  const whenLabel = regular
    ? formatEventRecurrence(
        String(event.scheduleLabel || event.recurrence || "").trim(),
      )
    : String(event.scheduleLabel || "").trim();
  if (whenLabel) {
    const when = document.createElement("span");
    when.textContent = whenLabel;
    date.appendChild(when);
  } else {
    const when = document.createElement("time");
    when.dateTime = event.date;
    when.textContent = formatEventDiaryDate(event.date);
    date.appendChild(when);
  }
  const span = formatEventSpan(event.startTime, event.endTime, event.time);
  if (span) {
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = span;
    date.appendChild(time);
  }

  const title = document.createElement("h2");
  title.className = "event-title";
  title.textContent = event.title;
  copy.append(date, title);

  const hostName = String(event.hostName || "").trim();
  const hostThisWeek = Boolean(event.hostThisWeek);
  if (hostName && !hostThisWeek) {
    copy.appendChild(
      teaserLine("Coming up", hostDate, hostName, String(event.hostHref || "")),
    );
  }
  if (hostThisWeek && hostName) {
    copy.appendChild(teaserLine("This week", hostDate, hostName));
  }

  if (event.offer) {
    const offer = document.createElement("p");
    offer.className = "event-offer";
    offer.textContent = event.offer;
    copy.appendChild(offer);
  }

  const schedule = nightScheduleBlock(event.nightSchedule);
  if (schedule) copy.appendChild(schedule);

  if (event.description) {
    copy.appendChild(eventDescription(event.description));
  }
  appendPageLink(copy, event.pageUrl);

  const follow = document.createElement("div");
  follow.className = "event-follow";
  const thisWeekName = String(event.thisWeekName || "").trim();
  if (thisWeekName) {
    follow.appendChild(
      teaserLine("This week", String(event.thisWeekDate || ""), thisWeekName),
    );
  }
  const upcomingName = String(event.upcomingName || "").trim();
  if (upcomingName) {
    follow.appendChild(
      teaserLine("Next", String(event.upcomingDate || ""), upcomingName),
    );
  } else if (!hostName && !thisWeekName) {
    const upcoming = String(event.upcoming || "").trim();
    if (upcoming) {
      const guest = document.createElement("p");
      guest.className = "event-next";
      guest.textContent = upcoming;
      follow.appendChild(guest);
    }
  }
  if (Number(event.nightCount) > 1) {
    const more = document.createElement("p");
    more.className = "event-more-dates";
    more.textContent = "More dates and info";
    follow.appendChild(more);
  }
  if (follow.childElementCount) copy.appendChild(follow);

  card.appendChild(copy);
  item.appendChild(card);
  item.dataset.schedule = event.schedule === "once" ? "once" : "series";
  return item;
}

function diaryLabel(group, lead) {
  const copy = diaryGroups[group];
  const item = document.createElement("li");
  item.id = copy.id;
  item.className = `whats-on-divider${lead ? " whats-on-divider--lead" : ""}`;
  item.dataset.group = copy.id;
  const heading = document.createElement("h2");
  heading.className = "whats-on-group-label";
  heading.textContent = copy.label;
  const tagline = document.createElement("p");
  tagline.className = "whats-on-group-tagline";
  tagline.textContent = copy.tagline;
  item.append(heading, tagline);
  return item;
}

/** Special events first, then regular nights. Headers only when a special is listed. */
function syncDiaryLabels(list) {
  const cards = [
    ...list.querySelectorAll(":scope > li:not(.whats-on-divider)"),
  ];
  const special = cards.filter((item) => item.dataset.schedule === "once");
  const series = cards.filter((item) => item.dataset.schedule !== "once");
  for (const label of list.querySelectorAll(":scope > .whats-on-divider")) {
    label.remove();
  }
  if (special.length) {
    const lead = diaryLabel("special", true);
    list.prepend(lead);
    let anchor = lead;
    for (const card of special) {
      anchor.after(card);
      anchor = card;
    }
    if (series[0]) series[0].before(diaryLabel("series", false));
  }
  document.dispatchEvent(new Event("gwenda:page-anchors"));
}

function appendDiaryCards(list, nights, { eagerFirst = false } = {}) {
  nights.forEach((night, index) => {
    list.appendChild(seriesCard(night, { eager: eagerFirst && index === 0 }));
  });
  syncDiaryLabels(list);
}

/** Series detail (Gwenda Nights): full night card. */
function nightCard(event, { eager = false } = {}) {
  const item = document.createElement("li");
  item.className = "event-card";
  item.appendChild(eventMedia(event, eager, 1800));

  const copy = document.createElement("article");
  copy.className = "event-copy";

  const date = document.createElement("p");
  date.className = "event-date";
  const when = document.createElement("time");
  when.dateTime = event.date;
  when.textContent = formatEventDiaryDate(event.date);
  date.appendChild(when);
  const span = formatEventSpan(event.startTime, event.endTime, event.time);
  if (span) {
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = span;
    date.appendChild(time);
  }

  const title = document.createElement("h2");
  title.className = "event-title";
  title.textContent = event.title;
  copy.append(date, title);

  if (event.offer) {
    const offer = document.createElement("p");
    offer.className = "event-offer";
    offer.textContent = event.offer;
    copy.appendChild(offer);
  }
  if (event.artist) {
    const artist = document.createElement("p");
    artist.className = "event-artist";
    artist.textContent = event.artist;
    copy.appendChild(artist);
  }

  const slots =
    Array.isArray(event.nightSchedule) && event.nightSchedule.length
      ? event.nightSchedule
      : event.seriesNightSchedule;
  const schedule = nightScheduleBlock(slots);
  if (schedule) copy.appendChild(schedule);

  copy.appendChild(
    eventDescription(event.description, "event-description", event.time),
  );
  appendPageLink(copy, event.pageUrl);

  item.appendChild(copy);
  return item;
}

/**
 * The diary is baked into the HTML, then read again from /api/whats-on so
 * "next", "this week", and past nights follow the clock between rebuilds.
 */
export function readsLiveDiary(env) {
  const site = String(env || "");
  return site === "local" || site === "staging" || site === "production";
}

/** Earliest diary card that still has a title and a date. */
export function earliestDiaryNight(nights) {
  return (
    (Array.isArray(nights) ? nights : [])
      .filter((night) => night?.title && night?.date)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null
  );
}

function fillHomeLine(path, title, metaText, isoDate = "") {
  if (!(path instanceof HTMLElement)) return;
  const name = path.querySelector(".what-we-do-next-name");
  const meta = path.querySelector(".what-we-do-next-meta");
  if (name) name.textContent = title || "";
  if (!(meta instanceof HTMLElement)) return;
  meta.replaceChildren();
  if (!metaText) return;
  if (isoDate) {
    const time = document.createElement("time");
    time.dateTime = isoDate;
    time.textContent = metaText;
    meta.appendChild(time);
    return;
  }
  meta.textContent = metaText;
}

/** Home What's on path: the next night, or a blank line once the diary is quiet. */
export function applyHomeNext(path, night) {
  const when = night?.date ? formatShortEventDate(night.date) : "";
  const title = night?.title && when ? night.title : "";
  fillHomeLine(path, title, title ? when : "", title ? night.date : "");
}

/** Home artist path: their name, and the months they are on the wall. */
export function applyHomeArtist(path, artist) {
  const who = String(artist?.name || "").trim();
  fillHomeLine(path, who, artistRunLabel(artist?.startMonth, artist?.endMonth));
}

/** @type {AbortController | null} */
let homeNextAbort = null;

export function initHomeNext() {
  const path = document.querySelector("[data-home-next]");
  if (!(path instanceof HTMLElement)) return;
  if (!readsLiveDiary(pageSiteEnv())) return;

  homeNextAbort?.abort();
  homeNextAbort = new AbortController();
  const { signal } = homeNextAbort;

  const artistPath = document.querySelector("[data-home-artist]");

  void fetch("/api/whats-on?limit=24", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`What's on failed (${res.status})`);
      return res.json();
    })
    .then((data) => {
      if (signal.aborted || !document.contains(path)) return;
      applyHomeNext(path, earliestDiaryNight(data.nights));
    })
    .catch((error) => {
      if (signal.aborted || error?.name === "AbortError") return;
    });

  if (!(artistPath instanceof HTMLElement)) return;
  void fetch("/api/featured-artist", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Featured artist failed (${res.status})`);
      return res.json();
    })
    .then((data) => {
      if (signal.aborted || !document.contains(artistPath)) return;
      applyHomeArtist(artistPath, data.artist);
    })
    .catch((error) => {
      if (signal.aborted || error?.name === "AbortError") return;
    });
}

function pageSiteEnv() {
  return document.documentElement?.dataset?.siteEnv || "";
}

function applyLiveMedia(card, event, width, eager) {
  const media = card.querySelector(":scope > .event-media");
  const next = eventMedia(event, eager, width);
  if (media) media.replaceWith(next);
  else card.prepend(next);
}

function ensureHomeList(content) {
  let list = content.querySelector(".events-list");
  if (list instanceof HTMLOListElement) return list;
  list = document.createElement("ol");
  list.className = "events-list whats-on-series-list";
  content.replaceChildren(list);
  return list;
}

async function refreshHome(content, { signal } = {}) {
  const empty = document.getElementById("whats-on-empty");
  const loading = document.getElementById("whats-on-loading");
  const res = await fetch("/api/whats-on?limit=24", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (signal?.aborted) return;
  if (!res.ok) throw new Error(`What's on failed (${res.status})`);
  const data = await res.json();
  if (signal?.aborted) return;
  if (!document.contains(content)) return;
  const nights = Array.isArray(data.nights) ? data.nights : [];
  const nextCursor = data.next || null;
  loading?.remove();
  if (!nights.length) {
    empty?.removeAttribute("hidden");
    content.replaceChildren();
    content.dataset.whatsOnNext = "";
    return;
  }
  empty?.setAttribute("hidden", "true");
  const list = ensureHomeList(content);
  list.replaceChildren();
  appendDiaryCards(list, nights, { eagerFirst: true });
  content.dataset.whatsOnNext = nextCursor ? JSON.stringify(nextCursor) : "";
  if (nextCursor) setupLoadMore(content, list);
}

/** @type {AbortController | null} */
let homeAbort = null;

export function initWhatsOnPage() {
  const content = document.getElementById("whats-on-content");
  if (!(content instanceof HTMLElement)) return;
  bindHostJumps(content);

  homeAbort?.abort();
  homeAbort = new AbortController();
  const { signal } = homeAbort;

  let nextCursor = null;
  try {
    nextCursor = content.dataset.whatsOnNext
      ? JSON.parse(content.dataset.whatsOnNext)
      : null;
  } catch {
    nextCursor = null;
  }

  const empty = document.getElementById("whats-on-empty");
  const loading = document.getElementById("whats-on-loading");
  const hasStatic = Boolean(content.querySelector(".event-card"));
  const live = readsLiveDiary(pageSiteEnv());

  if (live || !hasStatic) {
    if (live) content.dataset.live = "pending";
    else loading?.remove();
    void refreshHome(content, { signal })
      .then(() => {
        if (signal.aborted || !document.contains(content)) return;
        if (live) content.dataset.live = "ready";
      })
      .catch((error) => {
        if (signal.aborted || error?.name === "AbortError") return;
        if (live && hasStatic) {
          content.dataset.live = "static";
          loading?.remove();
          empty?.setAttribute("hidden", "true");
          if (nextCursor) setupLoadMore(content, ensureHomeList(content));
          return;
        }
        if (loading) {
          loading.hidden = false;
          loading.textContent = "Could not load what's on. Please try again.";
        }
      });
    return;
  }

  loading?.remove();
  empty?.setAttribute("hidden", "true");
  if (nextCursor) {
    const list = ensureHomeList(content);
    setupLoadMore(content, list);
  }
}

function setupLoadMore(content, list) {
  let nextCursor = null;
  try {
    nextCursor = content.dataset.whatsOnNext
      ? JSON.parse(content.dataset.whatsOnNext)
      : null;
  } catch {
    nextCursor = null;
  }
  if (!nextCursor) return;

  document.getElementById("whats-on-more")?.remove();

  let loadingMore = false;
  const more = document.createElement("p");
  more.id = "whats-on-more";
  more.className = "events-more";
  content.appendChild(more);

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
    if (!document.contains(content) || !document.contains(list)) return;
    loadingMore = true;
    more.textContent = "Looking further ahead…";
    try {
      const params = new URLSearchParams({
        after: nextCursor.after,
        afterId: nextCursor.afterId || "",
        limit: "6",
      });
      const res = await fetch(`/api/whats-on?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`What's on failed (${res.status})`);
      const data = await res.json();
      if (!document.contains(list)) return;
      const nights = Array.isArray(data.nights) ? data.nights : [];
      appendDiaryCards(list, nights);
      nextCursor = data.next || null;
      content.dataset.whatsOnNext = nextCursor
        ? JSON.stringify(nextCursor)
        : "";
      more.textContent = "";
      if (!nextCursor) more.remove();
    } catch {
      more.remove();
      nextCursor = null;
    } finally {
      loadingMore = false;
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "480px" },
    );
    observer.observe(more);
  }
}

function seriesHeroSource(detail) {
  const guest = detail?.featuredGuest;
  if (guest?.heroImageUrl) return guest;
  return {
    title: detail?.title || "",
    heroImageUrl: detail?.heroImageUrl || "",
    heroImage: detail?.heroImage || null,
    heroImageAlt: detail?.heroImageAlt || detail?.title || "",
    imageCaption: "",
    imageCaptionName: "",
  };
}

function upcomingDatesBlock(dates) {
  const block = document.createElement("div");
  block.className = "event-dates";
  const label = document.createElement("p");
  label.className = "event-dates-label";
  label.textContent = "Nights ahead";
  const list = document.createElement("ul");
  for (const night of dates) {
    const item = document.createElement("li");
    if (night.displaced && night.href) {
      const link = document.createElement("a");
      link.className = "event-dates-instead";
      link.href = night.href;
      link.textContent = night.line || "";
      item.appendChild(link);
    } else if (night.date) {
      const when = document.createElement("time");
      when.dateTime = night.date;
      when.textContent = formatEventDate(night.date);
      item.appendChild(when);
      const artist = String(night.artist || "").trim();
      if (night.isSpecialEdition && artist) {
        const guest = document.createElement("p");
        guest.className = "event-dates-guest";
        guest.textContent = `Special guest · ${artist}`;
        item.appendChild(guest);
      }
    }
    if (item.childElementCount) list.appendChild(item);
  }
  block.append(label, list);
  return block;
}

function applyRecurringSeriesCopy(main, detail) {
  const copy = main.querySelector(".event-copy");
  if (!(copy instanceof HTMLElement)) return;
  const guest = detail.featuredGuest;
  const nextDate = String(detail.nextDate || guest?.date || "").trim();
  const offer = String(guest?.offer || detail.offer || "").trim();
  const artist = String(guest?.artist || "").trim();
  const description = String(guest?.description || detail.description || "");
  const slots =
    Array.isArray(guest?.nightSchedule) && guest.nightSchedule.length
      ? guest.nightSchedule
      : detail.nightSchedule;
  const pageUrl = guest?.pageUrl || detail.nights?.[0]?.pageUrl || "";
  const title = String(detail.title || copy.querySelector(".event-title")?.textContent || "");

  copy.replaceChildren();
  if (nextDate) {
    const date = document.createElement("p");
    date.className = "event-date";
    const when = document.createElement("time");
    when.dateTime = nextDate;
    when.textContent = formatEventDiaryDate(nextDate);
    date.appendChild(when);
    const span = formatEventSpan(
      guest?.startTime || detail.startTime,
      guest?.endTime || detail.endTime,
      guest?.time || detail.time,
    );
    if (span) {
      const time = document.createElement("span");
      time.className = "event-time";
      time.textContent = span;
      date.appendChild(time);
    }
    copy.appendChild(date);
  }
  const heading = document.createElement("h2");
  heading.className = "event-title";
  heading.textContent = title;
  copy.appendChild(heading);
  if (offer) {
    const offerLine = document.createElement("p");
    offerLine.className = "event-offer";
    offerLine.textContent = offer;
    copy.appendChild(offerLine);
  }
  if (artist) {
    const guestLine = document.createElement("p");
    guestLine.className = "event-artist";
    guestLine.textContent = `Special guest · ${artist}`;
    copy.appendChild(guestLine);
  }
  const schedule = nightScheduleBlock(slots);
  if (schedule) copy.appendChild(schedule);
  if (description.trim()) copy.appendChild(eventDescription(description));
  appendPageLink(copy, pageUrl);
  const dates = Array.isArray(detail.upcomingDates) ? detail.upcomingDates : [];
  if (dates.length) copy.appendChild(upcomingDatesBlock(dates));
}

function withSeriesSchedule(night, detail) {
  return { ...night, seriesNightSchedule: detail?.nightSchedule || [] };
}

async function refreshSeriesDetail(page, root, { signal } = {}) {
  const seriesId = root.dataset.seriesId || "";
  if (!seriesId) throw new Error("Missing series.");
  const res = await fetch(`/api/whats-on/${encodeURIComponent(seriesId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (signal?.aborted) return;
  if (res.status === 404) {
    window.location.assign("/whats-on");
    return;
  }
  if (!res.ok) throw new Error(`Series failed (${res.status})`);
  const data = await res.json();
  if (signal?.aborted) return;
  if (!document.contains(page) || !document.contains(root)) return;
  const detail = data.series;
  if (!detail) throw new Error("Series not found.");
  const main = page.querySelector(".whats-on-series-main");
  if (main) {
    applyLiveMedia(main, seriesHeroSource(detail), 1800, true);
    applyRecurringSeriesCopy(main, detail);
  }
  const list = root.querySelector(".events-list");
  const nights = Array.isArray(detail.nights) ? detail.nights : [];
  if (list instanceof HTMLOListElement && root.dataset.seriesRich === "true") {
    list.replaceChildren(
      ...nights.map((night, index) =>
        nightCard(withSeriesSchedule(night, detail), { eager: index === 0 }),
      ),
    );
  }
  root.dataset.seriesNext = detail.next ? JSON.stringify(detail.next) : "";
  page.dataset.live = "ready";
}

/** @type {AbortController | null} */
let seriesAbort = null;

export function initSeriesPage() {
  const root = document.getElementById("series-nights");
  if (!(root instanceof HTMLElement)) return;
  const page = document.querySelector("main.whats-on-series-page");

  seriesAbort?.abort();
  seriesAbort = new AbortController();
  const { signal } = seriesAbort;

  const live = readsLiveDiary(pageSiteEnv()) && page instanceof HTMLElement;
  if (live) page.dataset.live = "pending";

  void (async () => {
    if (live) {
      try {
        await refreshSeriesDetail(page, root, { signal });
      } catch (error) {
        if (signal.aborted || error?.name === "AbortError") return;
        if (page.dataset.live === "pending") page.dataset.live = "static";
      }
    }
    if (signal.aborted || !document.contains(root)) return;
    setupSeriesLoadMore(root, signal);
  })();
}

function setupSeriesLoadMore(root, signal) {
  if (root.dataset.seriesRich !== "true") return;
  const seriesId = root.dataset.seriesId || "";
  let nextCursor = null;
  try {
    nextCursor = root.dataset.seriesNext
      ? JSON.parse(root.dataset.seriesNext)
      : null;
  } catch {
    nextCursor = null;
  }
  if (!seriesId || !nextCursor) return;

  // Avoid stacking another infinite-scroll sentinel on re-init (View Transitions).
  document.getElementById("series-more")?.remove();

  let loadingMore = false;
  const list = root.querySelector(".events-list");
  if (!(list instanceof HTMLOListElement)) return;

  const more = document.createElement("p");
  more.id = "series-more";
  more.className = "events-more";
  root.appendChild(more);

  async function loadMore() {
    if (loadingMore || !nextCursor || signal.aborted) return;
    loadingMore = true;
    more.textContent = "Looking further ahead…";
    try {
      const params = new URLSearchParams({
        after: nextCursor.after,
        afterId: nextCursor.afterId || "",
        limit: "6",
      });
      const res = await fetch(
        `/api/whats-on/${encodeURIComponent(seriesId)}?${params}`,
        { credentials: "same-origin", signal },
      );
      if (!res.ok) throw new Error(`Series failed (${res.status})`);
      const data = await res.json();
      if (signal.aborted || !document.contains(list)) return;
      const detail = data.series;
      const nights = Array.isArray(detail?.nights) ? detail.nights : [];
      list.append(
        ...nights.map((night) => nightCard(withSeriesSchedule(night, detail))),
      );
      nextCursor = detail?.next || null;
      more.textContent = "";
      if (!nextCursor) more.remove();
    } catch (error) {
      if (error?.name === "AbortError") return;
      more.remove();
      nextCursor = null;
    } finally {
      loadingMore = false;
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "480px" },
    );
    observer.observe(more);
    signal.addEventListener("abort", () => observer.disconnect(), {
      once: true,
    });
  }
}
