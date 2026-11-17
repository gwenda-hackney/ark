/**
 * Home's Food board as a stack of kitchen cards (FoodStack.astro, #306).
 * Without this the cards stand one under another; with it they stack in
 * one place, as tall as the tallest so nothing below moves, and the strips
 * under them pick which is on top: a click or tap, the arrow keys (a
 * tablist), or a sideways swipe on the cards. The chosen card slides up
 * over the top one, which tucks back in (CSS; a fade, or nothing, for
 * reduced motion).
 */

/** How far a finger has to travel sideways to count as a swipe. */
const SWIPE_PX = 40;

/** @param {HTMLElement} stack */
function setUp(stack) {
  if (stack.dataset.ready) return;
  const cards = [...stack.querySelectorAll("[data-food-card]")];
  const strips = [...stack.querySelectorAll("[data-food-strip]")];
  if (cards.length < 2 || strips.length !== cards.length) return;
  stack.dataset.ready = "";

  let current = Math.max(
    0,
    cards.findIndex((card) => card.hasAttribute("data-current")),
  );

  const show = (index, { focus = false } = {}) => {
    const next = (index + cards.length) % cards.length;
    if (next === current) return;
    const before = current;
    current = next;
    stack.dataset.moved = "";
    cards.forEach((card, i) => {
      card.toggleAttribute("data-current", i === next);
      card.toggleAttribute("data-leaving", i === before);
      card.inert = i !== next;
    });
    strips.forEach((strip, i) => {
      strip.setAttribute("aria-selected", i === next ? "true" : "false");
      strip.tabIndex = i === next ? 0 : -1;
    });
    if (focus) strips[next].focus();
  };

  cards.forEach((card, i) => {
    card.inert = i !== current;
    card.addEventListener("animationend", () =>
      card.removeAttribute("data-leaving"),
    );
  });
  strips.forEach((strip, i) => {
    strip.addEventListener("click", () => show(i));
    strip.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
        event.key
      ];
      if (step) {
        event.preventDefault();
        show(current + step, { focus: true });
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        show(event.key === "Home" ? 0 : cards.length - 1, { focus: true });
      }
    });
  });

  // A sideways swipe on the cards: left for the next, right for the one before
  const deck = stack.querySelector("[data-food-cards]");
  let from = null;
  deck?.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.touches[0];
      from = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    { passive: true },
  );
  deck?.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      from = null;
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        show(current + (dx < 0 ? 1 : -1));
      }
    },
    { passive: true },
  );

  stack.querySelector('[role="tablist"]').hidden = false;
  stack.classList.add("is-stacked");
}

export function initFoodStacks() {
  for (const stack of document.querySelectorAll("[data-food-stack]")) {
    setUp(stack);
  }
}
