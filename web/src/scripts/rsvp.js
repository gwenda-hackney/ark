function inviteTokenFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "invite" || !parts[1]) return null;
  return parts[1];
}

function showOnly(id) {
  for (const el of document.querySelectorAll(".invite-state")) {
    el.hidden = el.id !== id;
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setHeroImage(url, alt) {
  const hero = document.getElementById("invite-hero");
  if (!(hero instanceof HTMLImageElement) || !url) return;
  hero.src = `${url}${url.includes("?") ? "&" : "?"}w=640&auto=format`;
  hero.alt = alt || "";
  hero.hidden = false;
}

function renderEvent(event) {
  if (!event) return;

  if (event.title) {
    setText("invite-event-title", event.title);
    document.title = `${event.title} — Gwenda`;
  }

  if (event.description) {
    const description = document.getElementById("invite-event-description");
    if (description) {
      description.textContent = event.description;
      description.hidden = false;
    }
  }

  if (event.heroImageUrl) {
    setHeroImage(event.heroImageUrl, event.title || "Event at Gwenda");
  }
}

export async function initInviteRsvp() {
  const token = inviteTokenFromPath();
  if (!token) {
    showOnly("invite-error");
    setText("invite-error-text", "This invite link is incomplete.");
    return;
  }

  try {
    const res = await fetch(`/api/rsvp?token=${encodeURIComponent(token)}`, {
      credentials: "same-origin",
    });
    const data = await res.json();
    if (!res.ok) {
      showOnly("invite-error");
      setText("invite-error-text", data.error || "This invite link is not valid.");
      return;
    }

    const name = data.name?.trim() || "friend";
    showOnly("invite-form-wrap");
    renderEvent(data.event);
    setText("invite-greeting", `Dear ${name}, we'd love to welcome you.`);

    const guestsInput = document.getElementById("rsvp-guests");
    if (guestsInput instanceof HTMLInputElement && data.rsvpGuests != null) {
      guestsInput.value = String(data.rsvpGuests);
      setText(
        "rsvp-success",
        `Current RSVP: ${data.rsvpGuests} attending. You can update this any time.`,
      );
      const success = document.getElementById("rsvp-success");
      if (success) success.hidden = false;
    }

    const form = document.getElementById("rsvp-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("rsvp-guests");
      const errorEl = document.getElementById("rsvp-error");
      const successEl = document.getElementById("rsvp-success");
      if (!(input instanceof HTMLInputElement)) return;

      if (errorEl) errorEl.hidden = true;
      const guests = Number.parseInt(input.value, 10);

      const save = await fetch("/api/rsvp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, guests }),
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

      if (successEl) {
        successEl.textContent =
          saveData.rsvpGuests === 0
            ? "Thanks — we've noted you can't make it. You can change this any time."
            : `Thanks — we've noted ${saveData.rsvpGuests} attending. You can update this any time.`;
        successEl.hidden = false;
      }
    });
  } catch {
    showOnly("invite-error");
    setText("invite-error-text", "Something went wrong. Please try again.");
  }
}
