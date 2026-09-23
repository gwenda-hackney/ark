import {
  eventDescriptionParagraphs,
  formatEventDate,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";

const EVENT_FEED_PAGE_SIZE = 6;

function heroImageUrl(event, width) {
  const url = event.heroImageUrl || event.heroImage?.url;
  if (!url) return null;
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}&auto=format&q=86`;
}

function eventMedia(event, eager) {
  const url = heroImageUrl(event, 1200);
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
  img.alt = event.heroImage?.alt || event.title;
  img.loading = eager ? "eager" : "lazy";
  figure.appendChild(img);
  return figure;
}

function eventDescription(description, className = "event-description", legacyTime = "") {
  const wrap = document.createElement("div");
  wrap.className = className;
  for (const paragraph of eventDescriptionParagraphs(description, legacyTime)) {
    const node = document.createElement("p");
    node.textContent = paragraph;
    wrap.appendChild(node);
  }
  return wrap;
}

function guestEditionList(editions, regularDescription) {
  const wrap = document.createElement("div");
  wrap.className = "event-editions";

  const label = document.createElement("p");
  label.className = "event-editions-label";
  label.textContent = "Special guests";
  wrap.appendChild(label);

  const list = document.createElement("ul");
  for (const edition of editions) {
    const item = document.createElement("li");
    const imageUrl = heroImageUrl(edition, 480);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = edition.heroImage?.alt || edition.artist || "";
      image.loading = "lazy";
      item.appendChild(image);
    }
    const copy = document.createElement("div");
    const week = document.createElement("p");
    week.className = "event-edition-week";
    week.textContent = edition.weekLabel;
    const date = document.createElement("p");
    date.className = "event-edition-date";
    const time = document.createElement("time");
    time.dateTime = edition.date;
    time.textContent = formatEventDate(edition.date);
    date.appendChild(time);
    copy.append(week, date);
    if (edition.artist) {
      const artist = document.createElement("p");
      artist.className = "event-edition-artist";
      artist.textContent = `Special guest · ${edition.artist}`;
      copy.appendChild(artist);
    }
    if (edition.offer) {
      const offer = document.createElement("p");
      offer.className = "event-edition-offer";
      offer.textContent = edition.offer;
      copy.appendChild(offer);
    }
    if (edition.description && edition.description !== regularDescription) {
      copy.appendChild(
        eventDescription(edition.description, "event-edition-description"),
      );
    }
    item.appendChild(copy);
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

function eventCard(event, { regular = false, eager = false } = {}) {
  const item = document.createElement("li");
  item.className = `event-card${regular ? " event-card--regular" : ""}`;
  item.appendChild(eventMedia(event, eager));

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

  const title = document.createElement("h3");
  title.className = "event-title";
  title.textContent = event.title;
  copy.append(date, title);
  if (regular && event.recurrence) {
    const recurrence = document.createElement("p");
    recurrence.className = "event-recurrence";
    recurrence.textContent = formatEventRecurrence(event.recurrence);
    copy.appendChild(recurrence);
  }
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
  copy.appendChild(eventDescription(event.description, "event-description", event.time));
  if (regular && event.guestEditions?.length) {
    copy.appendChild(guestEditionList(event.guestEditions, event.description));
  }
  item.appendChild(copy);
  return item;
}

function feedUrl(cursor) {
  const params = new URLSearchParams({ limit: String(EVENT_FEED_PAGE_SIZE) });
  if (cursor?.after) {
    params.set("after", cursor.after);
    params.set("afterId", cursor.afterId || "");
  }
  return `/api/events?${params}`;
}

function ensureList() {
  const content = document.getElementById("events-content");
  if (!(content instanceof HTMLElement)) return null;
  let list = content.querySelector(".events-list");
  if (!(list instanceof HTMLOListElement)) {
    list = document.createElement("ol");
    list.className = "events-list";
    content.replaceChildren(list);
  }
  return list;
}

function renderFeed(events, { replace = false } = {}) {
  const content = document.getElementById("events-content");
  const empty = document.getElementById("events-empty");
  const loading = document.getElementById("events-loading");
  if (!(content instanceof HTMLElement)) return;
  loading?.remove();

  if (replace && events.length === 0) {
    empty?.removeAttribute("hidden");
    content.replaceChildren();
    return;
  }

  empty?.setAttribute("hidden", "true");
  const list = ensureList();
  if (!list) return;
  const cards = events.map((event, index) =>
    eventCard(event, {
      regular: Boolean(String(event.recurrence || "").trim()),
      eager: replace && index === 0,
    }),
  );
  if (replace) list.replaceChildren(...cards);
  else list.append(...cards);
}

let nextCursor = null;
let loadingMore = false;
let seenSignature = "";

function setMoreState(state) {
  let more = document.getElementById("events-more");
  if (state === "hidden") {
    more?.remove();
    return;
  }
  if (!(more instanceof HTMLElement)) {
    more = document.createElement("p");
    more.id = "events-more";
    more.className = "events-more";
    document.getElementById("events-content")?.appendChild(more);
  }
  more.textContent = state === "loading" ? "Looking further ahead…" : "";
}

async function loadFeed(cursor) {
  const res = await fetch(feedUrl(cursor), { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Events request failed (${res.status})`);
  return res.json();
}

function sentinelNearView() {
  const more = document.getElementById("events-more");
  if (!(more instanceof HTMLElement)) return false;
  return more.getBoundingClientRect().top < window.innerHeight + 480;
}

async function loadMore() {
  if (loadingMore || !nextCursor) return;
  loadingMore = true;
  setMoreState("loading");
  try {
    const data = await loadFeed(nextCursor);
    const events = Array.isArray(data.events) ? data.events : [];
    renderFeed(events);
    nextCursor = data.next || null;
    setMoreState(nextCursor ? "ready" : "hidden");
  } catch {
    setMoreState("hidden");
  } finally {
    loadingMore = false;
  }
  if (nextCursor && sentinelNearView()) void loadMore();
}

let feedObserver;

function watchFeed() {
  const content = document.getElementById("events-content");
  if (!content || !("IntersectionObserver" in window) || feedObserver) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    },
    { rootMargin: "480px" },
  );
  feedObserver = observer;
  const watch = () => {
    const more = document.getElementById("events-more");
    observer.disconnect();
    if (more) observer.observe(more);
  };
  const listObserver = new MutationObserver(watch);
  listObserver.observe(content, { childList: true });
  watch();
}

async function refreshEvents() {
  try {
    const data = await loadFeed(null);
    const events = Array.isArray(data.events) ? data.events : [];
    const signature = JSON.stringify(events);
    if (signature !== seenSignature) {
      seenSignature = signature;
      renderFeed(events, { replace: true });
    }
    nextCursor = data.next || null;
    setMoreState(nextCursor ? "ready" : "hidden");
    watchFeed();
  } catch {
    const loading = document.getElementById("events-loading");
    if (loading) loading.textContent = "Could not load events. Please try again.";
  }
}

export function initEventsPage() {
  void refreshEvents();
}
