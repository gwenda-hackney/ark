const INVITE_HISTORY_STATE = { inviteCard: "open" };

function faces() {
  return {
    card: document.getElementById("invite-card"),
    inner: document.querySelector("#invite-card .invite-card-inner"),
    front: document.getElementById("invite-card-open"),
    back: document.getElementById("invite-card-back"),
  };
}

function isInviteHistoryState(state) {
  return state?.inviteCard === "open";
}

function inviteHistoryActive() {
  return isInviteHistoryState(window.history.state);
}

let heightObserver = null;

function backInner(refs) {
  return refs.back?.querySelector(".invite-card-back-inner");
}

/** Back-face content height — drives card size while open (no internal scroll). */
function measureBackContentHeight(refs) {
  const el = backInner(refs);
  if (!(el instanceof HTMLElement)) return 0;

  let height = el.scrollHeight;
  const last = el.lastElementChild;
  if (last instanceof HTMLElement) {
    const elTop = el.getBoundingClientRect().top;
    const lastBottom = last.getBoundingClientRect().bottom;
    const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    height = Math.max(height, Math.ceil(lastBottom - elTop + padBottom));
  }

  return height;
}

/** Closed: CSS flex fills the viewport. Open: grow to fit back content. */
function syncHeight(refs) {
  const { card, inner } = refs;
  if (!inner || !card) return;

  if (!card.classList.contains("is-open")) {
    inner.style.height = "";
    return;
  }

  const backHeight = measureBackContentHeight(refs);
  if (backHeight > 0) {
    inner.style.height = `${backHeight + 1}px`;
  }
}

function bindHeightObserver(refs) {
  const inner = backInner(refs);
  if (!(inner instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;

  heightObserver?.disconnect();
  heightObserver = new ResizeObserver(() => {
    if (refs.card?.classList.contains("is-open")) syncHeight(refs);
  });
  heightObserver.observe(inner);
}

function resetSendingState(refs) {
  const { card, front } = refs;
  const idle = document.getElementById("invite-card-front-idle");
  const sending = document.getElementById("invite-card-front-sending");
  if (!card || !(front instanceof HTMLButtonElement)) return;

  card.classList.remove("is-sending");
  if (idle) idle.hidden = false;
  if (sending) sending.hidden = true;
  front.removeAttribute("aria-busy");
}

function applyOpenState(refs) {
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) {
    return false;
  }
  if (card.classList.contains("is-open")) return true;

  card.classList.add("is-open");
  front.setAttribute("aria-expanded", "true");
  front.disabled = true;
  front.setAttribute("aria-hidden", "true");
  requestAnimationFrame(() => {
    syncHeight(refs);
    requestAnimationFrame(() => syncHeight(refs));
  });
  return true;
}

function applyCloseState(refs) {
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) return;

  card.classList.remove("is-open");
  front.setAttribute("aria-expanded", "false");
  front.removeAttribute("aria-hidden");
  if (!card.classList.contains("is-sending")) {
    front.disabled = false;
  }
  syncHeight(refs);
}

function pushInviteHistory() {
  if (inviteHistoryActive()) return;
  window.history.pushState(INVITE_HISTORY_STATE, "", window.location.href);
}

function handlePopState(event) {
  const refs = faces();
  const { card } = refs;
  if (!card) return;

  if (isInviteHistoryState(event.state)) {
    applyOpenState(refs);
    return;
  }

  if (card.classList.contains("is-open") || card.classList.contains("is-sending")) {
    resetSendingState(refs);
    applyCloseState(refs);
  }
}

export function syncInviteCardHeight() {
  syncHeight(faces());
}

export function showInviteCard({ startOpen = false } = {}) {
  const scene = document.getElementById("invite-card-scene");
  if (scene) scene.hidden = false;
  initInviteCard({ startOpen });
}

export function hideInviteCard() {
  const scene = document.getElementById("invite-card-scene");
  if (scene) scene.hidden = true;
  const refs = faces();
  resetSendingState(refs);
  applyCloseState(refs);
  if (refs.inner) refs.inner.style.height = "";
}

export function closeInviteCard() {
  applyCloseState(faces());
}

export function openInviteCard({ pushHistory = true } = {}) {
  const refs = faces();
  if (!applyOpenState(refs)) return;
  if (pushHistory) pushInviteHistory();
}

/** Run after the card flip transition (or immediately if motion is reduced). */
export function afterInviteCardFlip(callback) {
  const inner = document.querySelector("#invite-card .invite-card-inner");
  if (!(inner instanceof HTMLElement)) {
    callback();
    return;
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    callback();
  };

  const onEnd = (event) => {
    if (event.propertyName !== "transform") return;
    inner.removeEventListener("transitionend", onEnd);
    finish();
  };

  inner.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, 900);
}

/** Flip open after a successful RSVP save and clear the front sending state. */
export function finishInviteCardRsvp(onRevealed) {
  const refs = faces();
  openInviteCard({ pushHistory: false });
  afterInviteCardFlip(() => {
    resetSendingState(refs);
    onRevealed?.();
    syncHeight(refs);
  });
}

/** Flip closed and show the front-face sending state while the RSVP saves. */
export function setInviteCardSending(isSending) {
  const refs = faces();
  const { card, front } = refs;
  const idle = document.getElementById("invite-card-front-idle");
  const sending = document.getElementById("invite-card-front-sending");
  if (!card || !(front instanceof HTMLButtonElement)) return;

  card.classList.toggle("is-sending", isSending);
  if (idle) idle.hidden = isSending;
  if (sending) sending.hidden = !isSending;

  if (isSending) {
    applyCloseState(refs);
    front.disabled = true;
    front.setAttribute("aria-busy", "true");
  } else {
    front.removeAttribute("aria-busy");
    if (!card.classList.contains("is-open")) {
      front.disabled = false;
    }
  }

  syncHeight(refs);
}

export function initInviteCard({ startOpen = false } = {}) {
  const refs = faces();
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) return;

  // Height is CSS-driven; clear any stale inline styles from older builds.
  syncHeight(refs);

  if (!card.dataset.historyBound) {
    window.addEventListener("popstate", handlePopState);
    card.dataset.historyBound = "true";
  }

  front.addEventListener("click", () => openInviteCard({ pushHistory: true }));

  bindHeightObserver(refs);
  syncHeight(refs);
  if (startOpen) openInviteCard({ pushHistory: true });
}
