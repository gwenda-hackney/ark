function faces() {
  return {
    card: document.getElementById("invite-card"),
    inner: document.querySelector("#invite-card .invite-card-inner"),
    front: document.getElementById("invite-card-open"),
    back: document.getElementById("invite-card-back"),
  };
}

// The back holds the real invite content, so both faces lock to its height —
// the closed card is the same size as the open one, like a physical card.
function contentFace({ front, back }) {
  return back || front;
}

function syncHeight(refs) {
  const { inner } = refs;
  const face = contentFace(refs);
  if (!inner || !face) return;
  inner.style.height = `${face.offsetHeight}px`;
}

export function showInviteCard({ startOpen = false } = {}) {
  const scene = document.getElementById("invite-card-scene");
  if (scene) scene.hidden = false;
  initInviteCard({ startOpen });
}

export function hideInviteCard() {
  const scene = document.getElementById("invite-card-scene");
  if (scene) scene.hidden = true;
  const { card, inner, front } = faces();
  card?.classList.remove("is-open");
  if (inner) inner.style.height = "";
  if (front instanceof HTMLButtonElement) {
    front.disabled = false;
    front.setAttribute("aria-expanded", "false");
    front.removeAttribute("aria-hidden");
  }
}

export function initInviteCard({ startOpen = false } = {}) {
  const refs = faces();
  const { card, front } = refs;
  if (!card || !(front instanceof HTMLButtonElement)) return;

  // Lock the card to the back (invite) height in both states so the closed card
  // is the same size as the open one and the flip has no resize step.
  if (typeof ResizeObserver !== "undefined" && !card.dataset.roBound) {
    const observer = new ResizeObserver(() => syncHeight(refs));
    observer.observe(front);
    if (refs.back) observer.observe(refs.back);
    card.dataset.roBound = "true";
  }
  window.addEventListener("resize", () => syncHeight(refs));

  const openCard = () => {
    if (card.classList.contains("is-open")) return;
    card.classList.add("is-open");
    front.setAttribute("aria-expanded", "true");
    front.disabled = true;
    front.setAttribute("aria-hidden", "true");
    syncHeight(refs);
  };

  front.addEventListener("click", openCard);

  requestAnimationFrame(() => {
    syncHeight(refs);
    if (startOpen) openCard();
  });
}
