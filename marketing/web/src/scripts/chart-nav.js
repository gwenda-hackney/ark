/**
 * Skip to content at the top of every page, and the record at the foot (Back
 * to top): the jump scrolls to the page's main, and focus goes there too.
 */
function initSkipLink() {
  const main = document.getElementById("main");
  if (!main) return;
  for (const link of document.querySelectorAll('.ch-page a[href="#main"]')) {
    if (!(link instanceof HTMLElement) || link.dataset.skipReady) continue;
    link.dataset.skipReady = "1";
    link.addEventListener("click", () => {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    });
  }
}

/**
 * Where a jump down the page lands, focus follows: the section's heading, or
 * the section itself when it is a link, so the keyboard and a screen reader
 * carry on from there.
 *
 * @param {HTMLElement} target
 */
function focusLanding(target) {
  const interactive = "a[href], button, input, select, textarea, [tabindex]";
  const heading = target.matches(interactive)
    ? target
    : target.querySelector("h2, h3") || target;
  if (!heading.matches(interactive)) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

/** A scroll smaller than this doesn't count (a trackpad's jitter). */
const SCROLL_NOISE = 8;
/** How far back up, past the hero, brings home's bar and button back. */
const SCROLL_UP_TO_SHOW = 40;

let homeAbort = null;

/**
 * Home (#240). Its links (the hero's, and on home the bar's and the panel's
 * too) go down the page to each place's own section (`home` in
 * lib/chart-nav), not to its page. The router makes the jump, so it is a
 * step Back undoes, smooth unless motion is reduced, with no page
 * transition; focus follows to where it lands.
 *
 * Home's bar and menu button (marked --reveal) stay out of sight while the
 * hero is in view and on the way down, and come back when the visitor, past
 * the hero, scrolls back up (data-reveal on the page; chart.css slides them).
 * Scrolls under SCROLL_NOISE don't count, and it takes SCROLL_UP_TO_SHOW to
 * bring them back, so a trackpad can't make them flicker. A jump (a link, or
 * Back) keeps them away until it has landed, so they never cover where it
 * lands; focus in them, or the panel open, keeps them.
 */
function initHome() {
  homeAbort?.abort();
  homeAbort = null;
  const page = document.querySelector(".ch-page.ch-home");
  const hero = document.getElementById("hero");
  if (!(page instanceof HTMLElement) || !hero) return;
  const controller = new AbortController();
  homeAbort = controller;
  const { signal } = controller;
  const reveal = [
    ...page.querySelectorAll(".ch-bar--reveal, .ch-chart-btn--reveal"),
  ];

  const setShown = (shown) => {
    page.dataset.reveal = shown ? "shown" : "hidden";
  };
  const held = () =>
    page.dataset.chart === "open" ||
    reveal.some((el) => el.contains(document.activeElement));

  let lastY = scrollY;
  let upBy = 0;
  let jumping = false;
  let jumpTimer = 0;
  const endJump = () => {
    jumping = false;
    clearTimeout(jumpTimer);
    lastY = scrollY;
    upBy = 0;
  };
  const startJump = () => {
    jumping = true;
    setShown(false);
    clearTimeout(jumpTimer);
    // The jump's scrollend ends it; this, where there is none, or no scroll
    jumpTimer = window.setTimeout(endJump, 1500);
  };

  setShown(false);

  addEventListener(
    "scroll",
    () => {
      const y = scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < SCROLL_NOISE) return;
      lastY = y;
      if (jumping) return;
      if (hero.getBoundingClientRect().bottom > 0) {
        upBy = 0;
        setShown(false);
      } else if (dy > 0) {
        upBy = 0;
        if (!held()) setShown(false);
      } else {
        upBy -= dy;
        if (upBy >= SCROLL_UP_TO_SHOW) setShown(true);
      }
    },
    { passive: true, signal },
  );
  addEventListener("scrollend", () => jumping && endJump(), { signal });
  // Back and Forward move the page too
  addEventListener("popstate", startJump, { signal });

  page.addEventListener(
    "focusin",
    (event) => {
      if (reveal.some((el) => el.contains(event.target))) setShown(true);
    },
    { signal },
  );

  page.addEventListener(
    "click",
    (event) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      // Skip to content and Back to top land on main itself (initSkipLink)
      if (link.getAttribute("href") === "#main") return;
      if (link.pathname !== location.pathname || !link.hash) return;
      const target = document.getElementById(
        decodeURIComponent(link.hash.slice(1)),
      );
      if (!target) return;
      startJump();
      // After the router has started the jump
      requestAnimationFrame(() => focusLanding(target));
    },
    { signal },
  );
}

let pageMovesMarked = false;

/**
 * Marks for moving between pages through the router (chart.css, Moving
 * between pages). The page going out is marked on its root as the move
 * starts (data-chart-leaving), so it and the page coming in are named apart
 * and each moves in its own place; the new root replaces the old one, mark
 * and all. The page coming in is marked (data-chart-arrived: "bar" when the
 * page it came from had the bar, "home" when not), so home's hero skips its
 * rise and the bar's mark draws itself in time with the move. A fresh load
 * has neither.
 */
export function markRouterArrivals() {
  if (pageMovesMarked) return;
  pageMovesMarked = true;
  document.addEventListener("astro:before-preparation", () => {
    document.documentElement.setAttribute("data-chart-leaving", "");
  });
  document.addEventListener("astro:before-swap", (event) => {
    const from = document.querySelector(".ch-bar:not(.ch-bar--reveal)")
      ? "bar"
      : "home";
    event.newDocument.documentElement.setAttribute("data-chart-arrived", from);
  });
}

/**
 * The chart opens from its button; the same button (a cross while open), the
 * scrim, Escape, or any link in it closes it. State lives on the page root (`data-chart`), so CSS
 * moves the panel and the scrim together. Closed, the panel is hidden from
 * the keyboard (chart.css); opening moves focus into it, and closing it from
 * the scrim or Escape hands focus back to the button. On home the button
 * comes and goes (initHome).
 */
export function initChartNav() {
  initSkipLink();
  initHome();

  const page = document.querySelector(".ch-page");
  const button = document.getElementById("ch-chart-btn");
  const panel = document.getElementById("ch-chart");
  const scrim = document.getElementById("ch-chart-scrim");
  if (!page || !button || !panel || !scrim) return;
  if (button.dataset.chartReady) return;
  button.dataset.chartReady = "1";

  const setOpen = (open) => {
    page.dataset.chart = open ? "open" : "closed";
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute(
      "aria-label",
      open ? "Close the menu" : "Open the menu",
    );
  };

  const close = () => {
    const inside = panel.contains(document.activeElement);
    setOpen(false);
    if (inside || document.activeElement === document.body) button.focus();
  };

  button.addEventListener("click", () => {
    if (page.dataset.chart === "open") {
      setOpen(false);
      return;
    }
    setOpen(true);
    // The panel turns visible on the same frame; it can take focus now
    panel.focus({ preventScroll: true });
  });
  scrim.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && page.dataset.chart === "open") close();
  });
}
