import {
  fadeOutElement,
  revealEnterScene,
  shouldSkipEntranceMotion,
} from "./entrance-motion.js";

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
let flipLock = false;
let flipGeneration = 0;

function frontPanels() {
  return {
    idle: document.getElementById("invite-card-front-idle"),
    sending: document.getElementById("invite-card-front-sending"),
  };
}

/** Keep front copy hidden until the flip finishes (avoids hint bleed mid-rotation). */
function setFrontPanel(mode) {
  const { idle, sending } = frontPanels();
  if (idle) idle.hidden = mode !== "idle";
  if (sending) sending.hidden = mode !== "sending";
}

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
  if (!card || !(front instanceof HTMLButtonElement)) return;

  card.classList.remove("is-sending");
  setFrontPanel("idle");
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

function applyCloseState(refs, { reveal = "idle" } = {}) {
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) return;

  if (card.classList.contains("is-open")) {
    beginCloseFlip(refs, { reveal });
    return;
  }

  if (card.classList.contains("is-sending")) {
    card.classList.remove("is-sending");
    setFrontPanel(reveal === "sending" ? "sending" : "idle");
    front.removeAttribute("aria-busy");
    front.disabled = false;
  }
}

function beginCloseFlip(refs, { reveal = "idle" } = {}) {
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) return;
  if (!card.classList.contains("is-open")) return;

  flipGeneration += 1;
  const generation = flipGeneration;
  flipLock = true;
  card.classList.add("is-flipping");
  setFrontPanel(reveal === "sending" ? "sending" : "hidden");

  card.classList.remove("is-open");
  front.setAttribute("aria-expanded", "false");
  front.removeAttribute("aria-hidden");
  front.disabled = true;
  syncHeight(refs);

  afterInviteCardFlip(() => {
    if (generation !== flipGeneration) return;
    flipLock = false;
    card.classList.remove("is-flipping");
    if (reveal === "idle") setFrontPanel("idle");
    if (reveal === "sending") setFrontPanel("sending");
    if (!card.classList.contains("is-open")) {
      front.disabled = false;
    }
  });
}

/** Test-only reset for pending flip callbacks between cases. */
export function resetInviteCardMotionForTests() {
  flipGeneration += 1;
  flipLock = false;
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
    applyCloseState(refs);
  }
}

export function syncInviteCardHeight() {
  syncHeight(faces());
}

/** Fade out the page loader before revealing the card or blocked panel. */
export function fadeOutRsvpLoading(onComplete) {
  const loading = document.getElementById("rsvp-loading");
  fadeOutElement(loading).then(() => onComplete?.());
}

export async function showInviteCard({ startOpen = false } = {}) {
  const scene = document.getElementById("invite-card-scene");
  if (!scene) return;

  scene.classList.remove("is-visible");
  initInviteCard({ startOpen });
  await revealEnterScene(scene, { unhide: true });
}

export function hideInviteCard() {
  const scene = document.getElementById("invite-card-scene");
  if (scene) {
    scene.hidden = true;
    scene.classList.remove("is-visible");
  }

  flipLock = false;
  const refs = faces();
  const { card, front } = refs;
  if (card) {
    card.classList.remove("is-flipping", "is-open", "is-sending");
  }
  if (front instanceof HTMLButtonElement) {
    front.setAttribute("aria-expanded", "false");
    front.removeAttribute("aria-hidden");
    front.removeAttribute("aria-busy");
    front.disabled = false;
  }
  setFrontPanel("idle");
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
  if (!(inner instanceof HTMLElement) || shouldSkipEntranceMotion()) {
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
  if (!card || !(front instanceof HTMLButtonElement)) return;

  if (isSending) {
    card.classList.add("is-sending");
    front.setAttribute("aria-busy", "true");
    if (card.classList.contains("is-open")) {
      applyCloseState(refs, { reveal: "sending" });
    } else {
      setFrontPanel("sending");
      front.disabled = true;
    }
    syncHeight(refs);
    return;
  }

  card.classList.remove("is-sending");
  front.removeAttribute("aria-busy");
  if (!card.classList.contains("is-open")) {
    setFrontPanel("idle");
    front.disabled = false;
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
