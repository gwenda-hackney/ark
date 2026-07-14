import { syncInviteCardHeight } from "./invite-card.js";

/** Map additional-guest pill to stored headcount (you + extras). 5 means 5+ extras (stores 6). */
export function additionalGuestsToTotal(additional) {
  if (additional == null || additional < 0 || additional > 5) return null;
  if (additional === 5) return 6;
  return 1 + additional;
}

export function totalToAdditionalGuests(total) {
  if (!total || total <= 0) return null;
  if (total >= 6) return 5;
  return total - 1;
}

/** @deprecated Use additionalGuestsToTotal — kept for transitional imports. */
export function pillTotalToStored(pillTotal) {
  return additionalGuestsToTotal(pillTotal);
}

/** @deprecated Use totalToAdditionalGuests — kept for transitional imports. */
export function storedToPillTotal(stored) {
  return totalToAdditionalGuests(stored);
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function readInput(id) {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el.value.trim() : "";
}

/**
 * Read the whole RSVP form into a response object.
 * Returns { ok:false, error } when something is missing.
 */
export function readRsvpForm() {
  const attendingBtn = document.querySelector(
    ".rsvp-pick--attending .rsvp-pick-btn.is-selected",
  );
  if (!(attendingBtn instanceof HTMLButtonElement)) {
    return { ok: false, error: "Let us know if you can make it." };
  }

  if (attendingBtn.dataset.attending === "no") {
    return { ok: true, attending: false, guests: 0 };
  }

  const name = readInput("rsvp-name");
  const email = readInput("rsvp-email");
  const countBtn = document.querySelector(
    ".rsvp-pick--counts .rsvp-pick-btn.is-selected",
  );

  if (!name) return { ok: false, error: "Please add your name." };
  if (!isValidEmail(email)) return { ok: false, error: "Please add a valid email." };

  let additional = 0;
  if (countBtn instanceof HTMLButtonElement) {
    const parsed = Number.parseInt(countBtn.dataset.additional ?? "", 10);
    if (Number.isInteger(parsed) && parsed >= 0) additional = parsed;
  }

  const guests = additionalGuestsToTotal(additional);
  if (guests == null) {
    return { ok: false, error: "Let us know if anyone else is coming." };
  }

  return { ok: true, attending: true, name, email, guests };
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement && value) el.value = value;
}

function selectInGroup(groupSelector, predicate) {
  for (const btn of document.querySelectorAll(`${groupSelector} .rsvp-pick-btn`)) {
    if (!(btn instanceof HTMLButtonElement)) continue;
    const selected = predicate(btn);
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
  }
}

function syncDetailsVisibility(attending) {
  const details = document.getElementById("rsvp-details");
  if (details) details.hidden = !attending;
}

/** After "Yes", bring the name field into view and put the cursor in it. */
function focusRsvpName() {
  const name = document.getElementById("rsvp-name");
  if (!(name instanceof HTMLInputElement)) return;
  requestAnimationFrame(() => {
    name.scrollIntoView({ behavior: "smooth", block: "center" });
    name.focus({ preventScroll: true });
  });
}

function syncSubmitVisibility(ready) {
  const submit = document.getElementById("rsvp-submit");
  if (submit instanceof HTMLButtonElement) submit.hidden = !ready;
}

/** Pre-fill the form from a known guest (returning visitor or personal invite). */
export function prefillRsvpForm({ name, email, rsvpGuests } = {}) {
  setInput("rsvp-name", name);
  setInput("rsvp-email", email);

  if (rsvpGuests == null) return;

  const attending = rsvpGuests > 0;
  selectInGroup(".rsvp-pick--attending", (btn) =>
    attending ? btn.dataset.attending === "yes" : btn.dataset.attending === "no",
  );

  const additional = attending ? totalToAdditionalGuests(rsvpGuests) : null;
  selectInGroup(".rsvp-pick--counts", (btn) => {
    const value = Number.parseInt(btn.dataset.additional ?? "", 10);
    return additional != null && value === additional;
  });

  syncDetailsVisibility(attending);
  syncSubmitVisibility(true);
}

function selectDefaultPartySize() {
  selectInGroup(
    ".rsvp-pick--counts",
    (btn) => btn instanceof HTMLButtonElement && btn.dataset.additional === "0",
  );
}

export function bindRsvpPickForm() {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  for (const btn of form.querySelectorAll(".rsvp-pick--attending .rsvp-pick-btn")) {
    btn.addEventListener("click", () => {
      if (!(btn instanceof HTMLButtonElement)) return;
      const attending = btn.dataset.attending === "yes";
      selectInGroup(".rsvp-pick--attending", (candidate) => candidate === btn);
      syncDetailsVisibility(attending);
      syncSubmitVisibility(true);
      requestAnimationFrame(() => syncInviteCardHeight());
      if (attending) {
        selectDefaultPartySize();
        focusRsvpName();
      }
    });
  }

  for (const btn of form.querySelectorAll(".rsvp-pick--counts .rsvp-pick-btn")) {
    btn.addEventListener("click", () => {
      if (!(btn instanceof HTMLButtonElement)) return;
      selectInGroup(".rsvp-pick--counts", (candidate) => candidate === btn);
    });
  }
}

/** Collapse the interactive controls once a reply has been recorded. */
export function lockRsvpForm() {
  for (const id of ["rsvp-attend-step", "rsvp-details", "rsvp-submit"]) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

/** Hide the invite details (hero, title, date, venue) so only the confirmation shows. */
function hideEventHeader() {
  const header = document.getElementById("rsvp-event-header");
  if (header) header.hidden = true;
}

/** Confirmation copy for the card back after a successful RSVP. */
export function formatSuccessContent({ attending } = {}) {
  if (!attending) {
    return {
      eyebrow: "Gwenda",
      title: "Thanks for letting us know",
      lead: "Sorry you can't make it. We'll catch you next time.",
    };
  }
  return {
    eyebrow: "You're on the list",
    title: "See you there",
    lead: "We've received your reply and emailed you your ticket link.",
  };
}

/** @deprecated Use formatSuccessContent — kept for tests that assert on lead copy. */
export function formatSuccessMessage({ attending } = {}) {
  const { lead } = formatSuccessContent({ attending });
  return attending ? `${lead} Can't wait to see you there.` : lead;
}

function setConfirmationText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Stage the confirmation on the card back before the flip completes. */
export function prepareRsvpConfirmation({ attending } = {}) {
  lockRsvpForm();
  hideEventHeader();
  const content = formatSuccessContent({ attending });
  setConfirmationText("rsvp-success-eyebrow", content.eyebrow);
  setConfirmationText("rsvp-success-title", content.title);
  setConfirmationText("rsvp-success-lead", content.lead);
  const wrap = document.getElementById("rsvp-confirmation");
  if (wrap) {
    wrap.hidden = false;
    wrap.classList.add("reveal");
    wrap.classList.remove("visible");
  }
  requestAnimationFrame(() => syncInviteCardHeight());
}

/** Rise the confirmation in after the card opens (see `.reveal` in global.css). */
export function revealRsvpConfirmation() {
  const wrap = document.getElementById("rsvp-confirmation");
  if (!wrap) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => wrap.classList.add("visible"));
  });
}
