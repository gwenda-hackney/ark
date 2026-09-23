import { formatEventWhen } from "../data/events.ts";

/** `/whats-on/<series>/<date>/ticket` (or legacy `/events/<slug>/ticket`). */
function parseTicketQuery() {
  const search = new URLSearchParams(window.location.search);
  const guest = search.get("guest");
  const token = search.get("t");
  if (!guest || !token) return null;
  const fromBody = document.body?.dataset?.occurrenceSlug?.trim();
  const parts = window.location.pathname.split("/").filter(Boolean);
  let slug = fromBody || "";
  if (!slug && parts[0] === "whats-on" && parts[1] && parts[2] && parts[3] === "ticket") {
    slug = `${decodeURIComponent(parts[1])}-${decodeURIComponent(parts[2])}`;
  }
  if (!slug && parts[0] === "events" && parts[1] && parts[2] === "ticket") {
    slug = decodeURIComponent(parts[1]);
  }
  if (!slug) return null;
  return { slug, guest, token };
}

function showOnly(id) {
  for (const el of document.querySelectorAll(".ticket-state")) {
    el.hidden = el.id !== id;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function blocked(message) {
  showOnly("ticket-error");
  setText("ticket-error-text", message);
}

function renderTicket(data, queryString) {
  const event = data.event || {};
  const guest = data.guest || {};

  if (event.title) {
    setText("ticket-event-title", event.title);
    document.title = `Your ticket · ${event.title} · Gwenda`;
  }

  if (event.date) {
    setText(
      "ticket-event-date",
      formatEventWhen(event.date, event.ticketStart, event.ticketEnd, event.time),
    );
  }

  const venueLink = document.getElementById("ticket-venue-link");
  if (venueLink && event.venue) venueLink.textContent = event.venue;

  setText("ticket-guest-name", guest.name || "Guest");
  setText("ticket-guest-party", guest.guests > 1 ? `Party of ${guest.guests}` : "Just you");

  const walletBtn = document.getElementById("ticket-wallet-btn");
  if (walletBtn instanceof HTMLAnchorElement) {
    walletBtn.href = `/api/ticket/pass?${queryString}`;
  }

  const calendarBtn = document.getElementById("ticket-calendar-btn");
  if (calendarBtn instanceof HTMLAnchorElement) {
    calendarBtn.href = `/api/ticket/calendar?${queryString}`;
  }

  if (event.heroImageUrl) {
    const hero = document.getElementById("ticket-hero");
    const wrap = document.getElementById("ticket-hero-wrap");
    if (hero instanceof HTMLImageElement) {
      hero.src = `${event.heroImageUrl}${event.heroImageUrl.includes("?") ? "&" : "?"}w=960&auto=format`;
      hero.alt = event.title || "Event at Gwenda";
    }
    if (wrap) wrap.hidden = false;
  }
}

export async function initEventTicket() {
  const parsed = parseTicketQuery();
  if (!parsed) {
    blocked("This ticket link isn't valid.");
    return;
  }

  const query = new URLSearchParams({
    slug: parsed.slug,
    guest: parsed.guest,
    t: parsed.token,
  });

  try {
    const res = await fetch(`/api/ticket?${query.toString()}`, {
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      blocked(data.error || "This ticket link isn't valid.");
      return;
    }

    renderTicket(data, query.toString());
    showOnly("ticket-view");
  } catch {
    blocked("Something went wrong. Please try again.");
  }
}
