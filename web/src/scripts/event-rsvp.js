import {
  bindRsvpPickForm,
  prepareRsvpConfirmation,
  revealRsvpConfirmation,
  readRsvpForm,
} from "./rsvp-guest-form.js";
import {
  finishInviteCardRsvp,
  hideInviteCard,
  openInviteCard,
  setInviteCardSending,
  showInviteCard,
  syncInviteCardHeight,
} from "./invite-card.js";
import { formatEventWhen } from "../data/events.ts";
import { portableTextToPlain } from "../lib/sanity/portable-text.ts";

/** `/events/<slug>` with the channel event password in the `?event-password=` query. */
function parseEventRsvp() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "events" || !parts[1] || parts[1] === "rsvp") return null;
  const search = new URLSearchParams(window.location.search);
  return {
    slug: decodeURIComponent(parts[1]),
    token: search.get("event-password") ?? search.get("key"),
  };
}

function showOnly(id) {
  for (const el of document.querySelectorAll(".rsvp-state")) {
    el.hidden = el.id !== id;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function blocked(message) {
  hideInviteCard();
  showOnly("rsvp-error");
  setText("rsvp-error-text", message);
}

function isPrivateEvent(event) {
  return event?.eventType === "private";
}

function setInviteCardFront(event) {
  if (!event) return;

  const eyebrow = document.getElementById("invite-card-eyebrow");
  const subtitle = document.getElementById("invite-card-subtitle");
  const lead = document.getElementById("invite-card-lead");

  if (eyebrow) eyebrow.hidden = !isPrivateEvent(event);

  if (subtitle && event.title) {
    subtitle.textContent = event.title;
    subtitle.hidden = false;
  }

  if (lead && event.date) {
    lead.textContent = formatEventWhen(event.date, event.ticketStart, event.ticketEnd);
    lead.hidden = false;
  }
}

function renderEvent(event) {
  if (!event) return;

  setInviteCardFront(event);

  const innerEyebrow = document.getElementById("rsvp-event-eyebrow-personal");
  if (innerEyebrow) innerEyebrow.hidden = !isPrivateEvent(event);

  if (event.title) {
    setText("rsvp-event-title-personal", event.title);
    document.title = `${event.title} · Gwenda`;
  }

  const dateEl = document.getElementById("rsvp-event-date-personal");
  if (dateEl && event.date) {
    dateEl.textContent = formatEventWhen(event.date, event.ticketStart, event.ticketEnd);
    dateEl.hidden = false;
  }

  const venueWrap = document.getElementById("rsvp-event-venue-wrap");
  const mapsLink = document.getElementById("rsvp-event-maps-link");
  if (venueWrap instanceof HTMLElement && mapsLink instanceof HTMLAnchorElement) {
    mapsLink.textContent = event.venue?.trim() || mapsLink.textContent;
    venueWrap.hidden = false;
  }

  const description = document.getElementById("rsvp-event-description-personal");
  const descriptionText = portableTextToPlain(event.description);
  if (description && descriptionText) {
    description.textContent = descriptionText;
    description.hidden = false;
  }

  if (!event.heroImageUrl) return;
  const heroUrl = `${event.heroImageUrl}${event.heroImageUrl.includes("?") ? "&" : "?"}w=960&auto=format`;
  const hero = document.getElementById("rsvp-hero-personal");
  const wrap = document.getElementById("rsvp-hero-personal-wrap");
  if (hero instanceof HTMLImageElement) {
    hero.src = heroUrl;
    hero.alt = event.title || "Event at Gwenda";
  }
  if (wrap) wrap.hidden = false;
}

function bindRsvpForm({ slug, token }) {
  bindRsvpPickForm();

  const form = document.getElementById("rsvp-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorEl = document.getElementById("rsvp-error-form");
    const submitEl = document.getElementById("rsvp-submit");
    if (errorEl) errorEl.hidden = true;

    const response = readRsvpForm();
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = response.error;
        errorEl.hidden = false;
      }
      return;
    }

    if (submitEl instanceof HTMLButtonElement) submitEl.disabled = true;
    setInviteCardSending(true);

    try {
      const save = await fetch("/api/rsvp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, token, ...response }),
      });
      const saveData = await save.json();
      if (!save.ok) {
        setInviteCardSending(false);
        openInviteCard();
        if (errorEl) {
          errorEl.textContent = saveData.error || "Could not save your RSVP.";
          errorEl.hidden = false;
        }
        if (submitEl instanceof HTMLButtonElement) submitEl.disabled = false;
        requestAnimationFrame(() => syncInviteCardHeight());
        return;
      }

      if (saveData.event) renderEvent(saveData.event);
      prepareRsvpConfirmation({ attending: response.attending });
      finishInviteCardRsvp(() => revealRsvpConfirmation());
    } catch {
      setInviteCardSending(false);
      openInviteCard();
      if (errorEl) {
        errorEl.textContent = "Something went wrong. Please try again.";
        errorEl.hidden = false;
      }
      if (submitEl instanceof HTMLButtonElement) submitEl.disabled = false;
      requestAnimationFrame(() => syncInviteCardHeight());
    }
  });
}

export async function initEventRsvp() {
  const parsed = parseEventRsvp();
  if (!parsed) {
    blocked("This invitation link isn't valid or has expired.");
    return;
  }

  const query = new URLSearchParams({ slug: parsed.slug });
  if (parsed.token) query.set("event-password", parsed.token);

  try {
    const res = await fetch(`/api/rsvp?${query.toString()}`, {
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      blocked(data.error || "This invitation link isn't valid or has expired.");
      return;
    }

    hideInviteCard();
    showOnly("rsvp-form-wrap");
    renderEvent(data.event);
    bindRsvpForm(parsed);
    showInviteCard({ startOpen: false });
  } catch {
    blocked("Something went wrong. Please try again.");
  }
}
