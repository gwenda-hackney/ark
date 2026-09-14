import { formatEventDate, getUpcomingEvents } from "../data/events";

function heroImageUrl(event) {
  if (!event.heroImageUrl) return null;
  const url = event.heroImageUrl;
  return `${url}${url.includes("?") ? "&" : "?"}w=960&auto=format`;
}

function renderEvents(events) {
  const list = document.getElementById("events-list");
  const empty = document.getElementById("events-empty");
  const loading = document.getElementById("events-loading");
  if (!(list instanceof HTMLElement)) return;

  loading?.remove();

  if (events.length === 0) {
    empty?.removeAttribute("hidden");
    return;
  }

  empty?.setAttribute("hidden", "true");
  list.replaceChildren(
    ...events.map((event) => {
      const item = document.createElement("li");
      item.className = "event-card reveal";

      if (event.heroImageUrl) {
        const img = document.createElement("img");
        img.className = "event-hero";
        img.src = heroImageUrl(event) ?? "";
        img.alt = event.title;
        img.loading = "lazy";
        item.appendChild(img);
      }

      const date = document.createElement("p");
      date.className = "event-date";
      const time = document.createElement("time");
      time.dateTime = event.date;
      time.textContent = formatEventDate(event.date);
      date.appendChild(time);

      const title = document.createElement("h2");
      title.className = "event-title";
      title.textContent = event.title;

      const description = document.createElement("p");
      description.className = "event-description";
      description.textContent = event.description;

      item.append(date, title, description);
      return item;
    }),
  );
}

export async function initEventsPage() {
  try {
    const res = await fetch("/api/events", { credentials: "same-origin" });
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : [];
    renderEvents(getUpcomingEvents(events));
  } catch {
    const loading = document.getElementById("events-loading");
    if (loading) loading.textContent = "Could not load events. Please try again.";
  }
}
