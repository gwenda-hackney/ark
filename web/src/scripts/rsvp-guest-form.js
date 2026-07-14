/** Map pill value to stored headcount. 6 means 5 or more. */
export function pillTotalToStored(pillTotal) {
  if (pillTotal == null || pillTotal < 1) return null;
  return pillTotal;
}

export function storedToPillTotal(stored) {
  if (!stored || stored <= 0) return null;
  if (stored >= 5) return 6;
  return stored;
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
  if (!(countBtn instanceof HTMLButtonElement)) {
    return { ok: false, error: "How many of you are coming?" };
  }

  const guests = pillTotalToStored(Number.parseInt(countBtn.dataset.total ?? "", 10));
  if (guests == null) return { ok: false, error: "How many of you are coming?" };

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

  const pillTotal = attending ? storedToPillTotal(rsvpGuests) : null;
  selectInGroup(".rsvp-pick--counts", (btn) => {
    const value = Number.parseInt(btn.dataset.total ?? "", 10);
    return pillTotal != null && value === pillTotal;
  });

  syncDetailsVisibility(attending);
  syncSubmitVisibility(true);
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
      if (attending) focusRsvpName();
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

export function formatSuccessMessage({ attending, guests } = {}) {
  if (!attending) {
    return "Thanks for letting us know. Sorry you can't make it, we'll catch you next time.";
  }
  if (!guests || guests <= 1) {
    return "Lovely, you're on the list. See you there.";
  }
  if (guests >= 6) {
    return "Lovely, we've got a party of 5 or more down for you. See you there.";
  }
  return `Lovely, we've got ${guests} of you down. See you there.`;
}
