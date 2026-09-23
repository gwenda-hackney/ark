import {
  eventDescriptionParagraphs,
  formatEventDiaryDate,
  formatEventRecurrence,
  formatEventSpan,
} from "../data/events";
import { formatShortEventDate } from "../../functions/_lib/event-series.js";

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
    kicker.textContent =
      String(event.imageCaption || "").trim() || "Next at Gwenda";
    const who = document.createElement("span");
    who.className = "event-media-caption-name";
    who.textContent = captionName;
    caption.append(kicker, who);
    figure.appendChild(caption);
  }
  return figure;
}

function teaserLine(label, isoDate, name) {
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
  return line;
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
      hostName ? `hosts ${hostName}` : "",
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
  if (hostName) {
    const hosts = document.createElement("p");
    hosts.className = "event-hosts";
    const line = document.createElement("span");
    line.className = "event-hosts-line";
    line.append("hosts ");
    const who = document.createElement("span");
    who.className = "event-hosts-name";
    who.textContent = hostName;
    line.appendChild(who);
    hosts.appendChild(line);
    if (hostDate && !hostThisWeek) {
      const time = document.createElement("time");
      time.className = "event-hosts-date";
      time.dateTime = hostDate;
      time.textContent = formatShortEventDate(hostDate);
      hosts.appendChild(time);
    }
    copy.appendChild(hosts);
  }

  if (hostThisWeek && hostName) {
    copy.appendChild(teaserLine("This week", hostDate, hostName));
  }
  const thisWeekName = String(event.thisWeekName || "").trim();
  if (thisWeekName) {
    copy.appendChild(
      teaserLine("This week", String(event.thisWeekDate || ""), thisWeekName),
    );
  }

  const upcomingName = String(event.upcomingName || "").trim();
  if (upcomingName) {
    copy.appendChild(
      teaserLine("Next", String(event.upcomingDate || ""), upcomingName),
    );
  } else if (!hostName && !thisWeekName) {
    const upcoming = String(event.upcoming || "").trim();
    if (upcoming) {
      const guest = document.createElement("p");
      guest.className = "event-next";
      guest.textContent = upcoming;
      copy.appendChild(guest);
    }
  }

  if (event.offer) {
    const offer = document.createElement("p");
    offer.className = "event-offer";
    offer.textContent = event.offer;
    copy.appendChild(offer);
  }

  if (event.description) {
    copy.appendChild(eventDescription(event.description));
  }

  if (Number(event.nightCount) > 1) {
    const more = document.createElement("p");
    more.className = "event-more-dates";
    more.textContent = "More dates →";
    copy.appendChild(more);
  }

  card.appendChild(copy);
  item.appendChild(card);
  return item;
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

function ensureHomeList(content) {
  let list = content.querySelector(".events-list");
  if (list instanceof HTMLOListElement) return list;
  list = document.createElement("ol");
  list.className = "events-list whats-on-series-list";
  content.replaceChildren(list);
  return list;
}

export function initWhatsOnPage() {
  const content = document.getElementById("whats-on-content");
  if (!(content instanceof HTMLElement)) return;

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
  loading?.remove();

  const hasStatic = Boolean(content.querySelector(".event-card"));
  if (!hasStatic) {
    void (async () => {
      try {
        const res = await fetch("/api/whats-on?limit=24", {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`What's on failed (${res.status})`);
        const data = await res.json();
        const nights = Array.isArray(data.nights) ? data.nights : [];
        nextCursor = data.next || null;
        if (!nights.length) {
          empty?.removeAttribute("hidden");
          content.replaceChildren();
          return;
        }
        empty?.setAttribute("hidden", "true");
        const list = ensureHomeList(content);
        list.replaceChildren(
          ...nights.map((night, index) =>
            seriesCard(night, { eager: index === 0 }),
          ),
        );
        content.dataset.whatsOnNext = nextCursor
          ? JSON.stringify(nextCursor)
          : "";
        if (nextCursor) setupLoadMore(content, list);
      } catch {
        const failed = document.getElementById("whats-on-loading");
        if (failed)
          failed.textContent = "Could not load what's on. Please try again.";
      }
    })();
    return;
  }

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

  let loadingMore = false;
  const more = document.createElement("p");
  more.id = "whats-on-more";
  more.className = "events-more";
  content.appendChild(more);

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
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
      const nights = Array.isArray(data.nights) ? data.nights : [];
      list.append(...nights.map((night) => seriesCard(night)));
      nextCursor = data.next || null;
      content.dataset.whatsOnNext = nextCursor ? JSON.stringify(nextCursor) : "";
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

export function initSeriesPage() {
  const root = document.getElementById("series-nights");
  if (!(root instanceof HTMLElement)) return;
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

  let loadingMore = false;
  const list = root.querySelector(".events-list");
  if (!(list instanceof HTMLOListElement)) return;

  const more = document.createElement("p");
  more.id = "series-more";
  more.className = "events-more";
  root.appendChild(more);

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
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
        { credentials: "same-origin" },
      );
      if (!res.ok) throw new Error(`Series failed (${res.status})`);
      const data = await res.json();
      const detail = data.series;
      const nights = Array.isArray(detail?.nights) ? detail.nights : [];
      list.append(...nights.map((night) => nightCard(night)));
      nextCursor = detail?.next || null;
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
