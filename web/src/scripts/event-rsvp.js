import {
  bindRsvpPickForm,
  formatSuccessMessage,
  lockRsvpForm,
  readRsvpForm,
} from "./rsvp-guest-form.js";
import { hideInviteCard, showInviteCard } from "./invite-card.js";

/** `/events/<slug>` with the channel access code in the `?key=` query. */
function parseEventRsvp() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "events" || !parts[1] || parts[1] === "rsvp") return null;
  return {
    slug: decodeURIComponent(parts[1]),
    token: new URLSearchParams(window.location.search).get("key"),
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

function renderEvent(event) {
  if (!event) return;

  if (event.title) {
    setText("rsvp-event-title-personal", event.title);
    document.title = `${event.title} · Gwenda`;
  }

  const description = document.getElementById("rsvp-event-description-personal");
  if (description && event.description) {
    description.textContent = event.description;
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
    const successEl = document.getElementById("rsvp-success");
    if (errorEl) errorEl.hidden = true;

    const response = readRsvpForm();
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = response.error;
        errorEl.hidden = false;
      }
      return;
    }

    const save = await fetch("/api/rsvp", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, token, ...response }),
    });
    const saveData = await save.json();
    if (!save.ok) {
      if (errorEl) {
        errorEl.textContent = saveData.error || "Could not save your RSVP.";
        errorEl.hidden = false;
      }
      return;
    }

    if (saveData.event) renderEvent(saveData.event);
    lockRsvpForm();
    if (successEl) {
      successEl.textContent = formatSuccessMessage(response);
      successEl.hidden = false;
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
  if (parsed.token) query.set("key", parsed.token);

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
