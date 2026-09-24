import { formatEventSpan } from "../data/events";
import { formatShortEventDate } from "../../functions/_lib/event-series.js";
import { readsLiveDiary } from "./whats-on.js";

function pageSiteEnv() {
  return document.documentElement?.dataset?.siteEnv || "";
}

function nightTime(night) {
  return formatEventSpan(night?.startTime, night?.endTime, night?.time);
}

function appendText(parent, className, text) {
  const node = document.createElement("span");
  node.className = className;
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

/**
 * @param {HTMLOListElement} list
 * @param {Array<{ id: string, label: string, nights: Array }>} weeks
 */
export function renderScheduleList(list, weeks) {
  list.replaceChildren();
  weeks.forEach((week, index) => {
    const heading = document.createElement("li");
    heading.id = `week-${week.id}`;
    heading.className = `whats-on-divider${index === 0 ? " whats-on-divider--lead" : ""}`;
    const label = document.createElement("h2");
    label.className = "whats-on-group-label";
    label.textContent = week.label;
    heading.appendChild(label);
    list.appendChild(heading);

    for (const night of week.nights || []) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.className = "schedule-row";
      link.href = night.href || "/whats-on";
      const when = night.date ? formatShortEventDate(night.date) : "";
      const time = nightTime(night);
      const artist = String(night.artist || "").trim();
      link.setAttribute(
        "aria-label",
        [
          when,
          night.title,
          night.seriesTitle,
          artist ? `Special guest, ${artist}` : "",
          time,
        ]
          .filter(Boolean)
          .join(". "),
      );

      const date = document.createElement("time");
      date.className = "schedule-when";
      if (night.date) date.dateTime = night.date;
      date.textContent = when;
      link.appendChild(date);

      const copy = document.createElement("span");
      copy.className = "schedule-copy";
      appendText(copy, "schedule-title", night.title || "Gwenda");
      if (night.seriesTitle)
        appendText(copy, "schedule-series", night.seriesTitle);
      if (artist)
        appendText(copy, "schedule-meta", `Special guest · ${artist}`);
      link.appendChild(copy);
      if (time) appendText(link, "schedule-time", time);
      item.appendChild(link);
      list.appendChild(item);
    }
  });
}

function ensureScheduleList(content) {
  let list = content.querySelector(".schedule-list");
  if (list instanceof HTMLOListElement) return list;
  list = document.createElement("ol");
  list.className = "schedule-list";
  content.replaceChildren(list);
  return list;
}

async function refreshSchedule(content, { signal } = {}) {
  const empty = document.getElementById("schedule-empty");
  const loading = document.getElementById("schedule-loading");
  const res = await fetch("/api/whats-on/schedule", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (signal?.aborted) return;
  if (!res.ok) throw new Error(`Schedule failed (${res.status})`);
  const data = await res.json();
  if (signal?.aborted) return;
  if (!document.contains(content)) return;
  const weeks = Array.isArray(data.weeks) ? data.weeks : [];
  loading?.remove();
  if (!weeks.length) {
    empty?.removeAttribute("hidden");
    content.replaceChildren();
    return;
  }
  empty?.setAttribute("hidden", "true");
  renderScheduleList(ensureScheduleList(content), weeks);
}

/** @type {AbortController | null} */
let scheduleAbort = null;

export function initSchedulePage() {
  const content = document.getElementById("schedule-content");
  if (!(content instanceof HTMLElement)) return;

  scheduleAbort?.abort();
  scheduleAbort = new AbortController();
  const { signal } = scheduleAbort;

  const empty = document.getElementById("schedule-empty");
  const loading = document.getElementById("schedule-loading");
  const hasStatic = Boolean(content.querySelector(".schedule-row"));
  const live = readsLiveDiary(pageSiteEnv());

  if (!live) {
    loading?.remove();
    if (hasStatic) empty?.setAttribute("hidden", "true");
    else empty?.removeAttribute("hidden");
    return;
  }

  content.dataset.live = "pending";
  void refreshSchedule(content, { signal })
    .then(() => {
      if (signal.aborted || !document.contains(content)) return;
      content.dataset.live = "ready";
    })
    .catch((error) => {
      if (signal.aborted || error?.name === "AbortError") return;
      if (hasStatic) {
        content.dataset.live = "static";
        loading?.remove();
        empty?.setAttribute("hidden", "true");
        return;
      }
      if (loading) {
        loading.hidden = false;
        loading.textContent = "Could not load the schedule. Please try again.";
      }
    });
}
