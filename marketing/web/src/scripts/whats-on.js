import {
  eventDescriptionParagraphs,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";
import { formatShortEventDate } from "../../functions/_lib/event-series.js";
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

/** Home: one basic series card. */
function seriesCard(event, { eager = false } = {}) {
  const regular = Boolean(event.regular);
  const href = String(event.href || "").trim();
  const item = document.createElement("li");
  const card = document.createElement(href ? "a" : "div");
  card.className = `event-card event-card--series${regular ? " event-card--regular" : ""}`;
  if (href) {
    card.href = href;
    const captionName = String(event.imageCaptionName || "").trim();
    const hostName = String(event.hostName || "").trim();
    const hostDate = String(event.hostDate || "").trim();
    const label = [
      event.title,
      String(event.imageCaptionName || "").trim()
        ? `Hosting ${event.imageCaptionName}`
        : "",
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
  const hostDate = String(event.hostDate || "").trim();
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

/** Regular events, then a labeled break, then special events. */
function syncDiaryLabels(list) {
  const cards = [
    ...list.querySelectorAll(":scope > li:not(.whats-on-divider)"),
  ];
  const hasSeries = cards.some((item) => item.dataset.schedule !== "once");
  const hasSpecial = cards.some((item) => item.dataset.schedule === "once");
  for (const label of list.querySelectorAll(":scope > .whats-on-divider")) {
    label.remove();
  }
  if (!hasSpecial) return;
  if (hasSeries) list.prepend(diaryLabel("series", true));
  const firstSpecial = [...list.children].find(
    (item) => item.dataset.schedule === "once",
  );
  if (firstSpecial) {
    list.insertBefore(
      diaryLabel("special", !hasSeries),
      firstSpecial,
    );
  }
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

  copy.appendChild(
    eventDescription(event.description, "event-description", event.time),
  );

  item.appendChild(copy);
  return item;
}

/** Staging What's on reads the diary live. Production keeps the baked pages. */
export function readsLiveDiary(env) {
  return String(env || "") === "staging";
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

async function refreshSeriesDetail(page, root, { signal } = {}) {
  const seriesId = root.dataset.seriesId || "";
  if (!seriesId) throw new Error("Missing series.");
  const res = await fetch(`/api/whats-on/${encodeURIComponent(seriesId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (signal?.aborted) return;
  if (!res.ok) throw new Error(`Series failed (${res.status})`);
  const data = await res.json();
  if (signal?.aborted) return;
  if (!document.contains(page) || !document.contains(root)) return;
  const detail = data.series;
  if (!detail) throw new Error("Series not found.");
  const main = page.querySelector(".whats-on-series-main");
  if (main) applyLiveMedia(main, seriesHeroSource(detail), 1800, true);
  const list = root.querySelector(".events-list");
  const nights = Array.isArray(detail.nights) ? detail.nights : [];
  if (list instanceof HTMLOListElement) {
    for (const card of list.querySelectorAll(":scope > li")) {
      const date = card.querySelector("time")?.getAttribute("datetime") || "";
      const night = nights.find((row) => row.date === date);
      if (night) applyLiveMedia(card, night, 1800, false);
    }
  }
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

  if (readsLiveDiary(pageSiteEnv()) && page instanceof HTMLElement) {
    page.dataset.live = "pending";
    void refreshSeriesDetail(page, root, { signal }).catch((error) => {
      if (signal.aborted || error?.name === "AbortError") return;
      if (page.dataset.live === "pending") page.dataset.live = "static";
    });
  }
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
      list.append(...nights.map((night) => nightCard(night)));
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
