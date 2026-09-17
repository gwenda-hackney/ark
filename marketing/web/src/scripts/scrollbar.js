/**
 * Overlay scrollbars that slide in from the right while scrolling / hovering.
 * Native bars are hidden; this paints a brand rail instead.
 */

const HIDE_MS = 900;

/**
 * @typedef {{
 *   root: HTMLElement,
 *   rail: HTMLElement,
 *   thumb: HTMLElement,
 *   isViewport: boolean,
 *   hideTimer: ReturnType<typeof setTimeout> | null,
 *   dragging: boolean,
 * }} ScrollbarHost
 */

/** @type {WeakMap<Element, ScrollbarHost>} */
const hosts = new WeakMap();

/** @type {ScrollbarHost | null} */
let viewportHost = null;

let listenersBound = false;

/**
 * @param {Element} el
 * @returns {boolean}
 */
function canScrollY(el) {
  if (el === document.documentElement || el === document.body) {
    return (
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight + 1
    );
  }
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  const overflowY = style.overflowY;
  if (
    overflowY !== "auto" &&
    overflowY !== "scroll" &&
    overflowY !== "overlay"
  ) {
    return false;
  }
  return el.scrollHeight > el.clientHeight + 1;
}

/**
 * @param {Element} scrollEl
 * @returns {ScrollbarHost | null}
 */
function ensureHost(scrollEl) {
  const isViewport =
    scrollEl === document.documentElement || scrollEl === document.body;

  if (isViewport && viewportHost?.rail.isConnected) {
    hosts.set(scrollEl, viewportHost);
    hosts.set(document.documentElement, viewportHost);
    return viewportHost;
  }

  const existing = hosts.get(scrollEl);
  if (existing?.rail.isConnected) return existing;

  const root = isViewport
    ? document.documentElement
    : scrollEl instanceof HTMLElement
      ? scrollEl
      : null;
  if (!root) return null;

  if (!isViewport) {
    const pos = getComputedStyle(root).position;
    if (pos === "static") root.style.position = "relative";
  }

  // Reuse a leftover viewport rail after View Transitions swap if present.
  let rail =
    isViewport
      ? document.body.querySelector(":scope > .gw-scrollbar")
      : null;
  let thumb = rail?.querySelector(".gw-scrollbar-thumb") ?? null;

  if (!(rail instanceof HTMLElement)) {
    rail = document.createElement("div");
    rail.className = "gw-scrollbar";
    rail.setAttribute("aria-hidden", "true");
    rail.dataset.astroTransitionPersist = "gw-scrollbar";

    thumb = document.createElement("div");
    thumb.className = "gw-scrollbar-thumb";
    rail.append(thumb);

    if (isViewport) {
      document.body.append(rail);
    } else {
      root.append(rail);
    }
  } else if (!(thumb instanceof HTMLElement)) {
    thumb = document.createElement("div");
    thumb.className = "gw-scrollbar-thumb";
    rail.append(thumb);
  }

  /** @type {ScrollbarHost} */
  const host = {
    root,
    rail,
    thumb,
    isViewport,
    hideTimer: null,
    dragging: false,
  };
  hosts.set(scrollEl, host);
  if (isViewport) {
    hosts.set(document.documentElement, host);
    viewportHost = host;
  }

  bindThumbDrag(host, scrollEl);
  return host;
}

/**
 * @param {ScrollbarHost} host
 * @param {Element} scrollEl
 */
function metrics(host, scrollEl) {
  if (host.isViewport) {
    const el = document.documentElement;
    return {
      scrollTop: el.scrollTop || document.body.scrollTop || 0,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    };
  }
  const el = /** @type {HTMLElement} */ (scrollEl);
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  };
}

/**
 * @param {ScrollbarHost} host
 * @param {Element} scrollEl
 */
function syncThumb(host, scrollEl) {
  const { scrollTop, scrollHeight, clientHeight } = metrics(host, scrollEl);
  if (scrollHeight <= clientHeight + 1) {
    host.rail.classList.remove("is-visible");
    return;
  }

  const track = clientHeight;
  const thumbH = Math.max(28, (clientHeight / scrollHeight) * track);
  const maxTop = Math.max(0, track - thumbH);
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  const top = (scrollTop / maxScroll) * maxTop;

  host.thumb.style.height = `${thumbH}px`;
  host.thumb.style.transform = `translate3d(0, ${top}px, 0)`;
}

/**
 * @param {ScrollbarHost} host
 * @param {Element} scrollEl
 */
function show(host, scrollEl) {
  if (document.documentElement.classList.contains("is-page-transitioning")) {
    return;
  }

  if (!canScrollY(scrollEl) && !host.isViewport) {
    host.rail.classList.remove("is-visible");
    return;
  }
  if (host.isViewport && !canScrollY(document.documentElement)) {
    host.rail.classList.remove("is-visible");
    return;
  }

  syncThumb(host, scrollEl);
  host.rail.classList.add("is-visible");

  if (host.hideTimer) clearTimeout(host.hideTimer);
  if (host.dragging) return;
  host.hideTimer = setTimeout(() => {
    if (!host.dragging && !host.rail.matches(":hover")) {
      host.rail.classList.remove("is-visible");
    }
  }, HIDE_MS);
}

/** Hide every overlay rail immediately (page swap / transition). */
export function hideOverlayScrollbars() {
  document.querySelectorAll(".gw-scrollbar").forEach((rail) => {
    rail.classList.remove("is-visible", "is-dragging");
  });
  if (viewportHost?.hideTimer) {
    clearTimeout(viewportHost.hideTimer);
    viewportHost.hideTimer = null;
  }
}

/**
 * @param {ScrollbarHost} host
 * @param {Element} scrollEl
 */
function bindThumbDrag(host, scrollEl) {
  if (host.rail.dataset.gwBound === "1") return;
  host.rail.dataset.gwBound = "1";

  let startY = 0;
  let startScroll = 0;

  const onMove = (event) => {
    if (!host.dragging) return;
    const { scrollHeight, clientHeight } = metrics(host, scrollEl);
    const thumbH = host.thumb.offsetHeight;
    const maxTop = Math.max(0, clientHeight - thumbH);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const delta = event.clientY - startY;
    const next = startScroll + (delta / Math.max(1, maxTop)) * maxScroll;
    if (host.isViewport) {
      window.scrollTo(0, next);
    } else if (scrollEl instanceof HTMLElement) {
      scrollEl.scrollTop = next;
    }
  };

  const onUp = () => {
    if (!host.dragging) return;
    host.dragging = false;
    host.rail.classList.remove("is-dragging");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    show(host, scrollEl);
  };

  host.thumb.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    host.dragging = true;
    host.rail.classList.add("is-visible", "is-dragging");
    startY = event.clientY;
    startScroll = metrics(host, scrollEl).scrollTop;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  host.rail.addEventListener("pointerenter", () => {
    show(host, scrollEl);
  });
}

/**
 * @param {Element} scrollEl
 */
function pulse(scrollEl) {
  if (!canScrollY(scrollEl) && scrollEl !== document.documentElement) return;
  const host = ensureHost(scrollEl);
  if (!host) return;
  show(host, scrollEl);
}

function bindTransitionHooks() {
  document.addEventListener("astro:before-preparation", () => {
    document.documentElement.classList.add("is-page-transitioning");
    hideOverlayScrollbars();
  });

  document.addEventListener("astro:after-swap", () => {
    document.documentElement.classList.add("is-page-transitioning");
    hideOverlayScrollbars();
    // Body was swapped — drop stale viewport host until ensureHost rebuilds.
    if (viewportHost && !viewportHost.rail.isConnected) {
      viewportHost = null;
    }
  });

  document.addEventListener("astro:page-load", () => {
    // Keep quiet through the fade, then allow normal scroll pulses.
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("is-page-transitioning");
      hideOverlayScrollbars();
    });
  });
}

export function initOverlayScrollbars() {
  document.documentElement.classList.add("gw-scrollbar-ready");

  if (listenersBound) return;
  listenersBound = true;

  bindTransitionHooks();

  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target;
      if (target === document || target === document.documentElement) {
        pulse(document.documentElement);
        return;
      }
      if (target instanceof Element) pulse(target);
    },
    { capture: true, passive: true },
  );

  // Keep select menus / overflow panels wired when they open.
  document.addEventListener(
    "pointerenter",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const scroller = target.closest(
        ".gw-select-menu, .contact-inner, [data-gw-scroll]",
      );
      if (scroller instanceof Element && canScrollY(scroller)) {
        pulse(scroller);
      }
    },
    true,
  );

  window.addEventListener(
    "resize",
    () => {
      const host = hosts.get(document.documentElement) ?? viewportHost;
      if (host?.rail.isConnected) syncThumb(host, document.documentElement);
    },
    { passive: true },
  );
}
