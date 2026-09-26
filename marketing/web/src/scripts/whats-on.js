import { formatShortEventDate } from "../../functions/_lib/event-series.js";
import { artistRunLabel } from "../lib/artist-run.js";
import { diaryGroups } from "../lib/diary-groups.js";
import {
  diaryCardModel,
  nightCardModel,
  renderEventCard,
  seriesCardModel,
} from "../lib/event-card.js";

/** One element from the shared card renderer (src/lib/event-card.js). */
function cardElement(model) {
  const template = document.createElement("template");
  template.innerHTML = renderEventCard(model).trim();
  const card = template.content.firstElementChild;
  bindHostJumps(card);
  return card;
}

/** What's on: a series card in its list item. */
function seriesCard(event, { eager = false } = {}) {
  const item = document.createElement("li");
  item.dataset.schedule = event.schedule === "once" ? "once" : "series";
  item.appendChild(cardElement(diaryCardModel(event, { eager })));
  return item;
}

/** Series page: one night. */
function nightCard(night, detail, { eager = false } = {}) {
  return cardElement(
    nightCardModel(night, { eager, seriesSchedule: detail?.nightSchedule }),
  );
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

/**
 * The diary is baked into the HTML, then read again from /api/whats-on so
 * "next", "this week", and past nights follow the clock between rebuilds.
 */
export function readsLiveDiary(env) {
  const site = String(env || "");
  return site === "local" || site === "preview" || site === "production";
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
  page
    .querySelector(".whats-on-series-main")
    ?.replaceWith(cardElement(seriesCardModel(detail)));
  page
    .querySelector(".whats-on-series-pending")
    ?.toggleAttribute("hidden", !detail.datesPending);
  const list = root.querySelector(".events-list");
  const nights = Array.isArray(detail.nights) ? detail.nights : [];
  if (list instanceof HTMLOListElement && root.dataset.seriesRich === "true") {
    list.replaceChildren(
      ...nights.map((night, index) =>
        nightCard(night, detail, { eager: index === 0 }),
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
      list.append(...nights.map((night) => nightCard(night, detail)));
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
