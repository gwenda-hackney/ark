/**
 * Overlay scrollbars that sit on top of content (no layout gutter).
 * Native bars are hidden. Reveal on scroll or when the pointer is on the rail.
 */

const HIDE_MS = 1800;
const NESTED = ".scrollbar-fade, .gw-select-menu, .event-rsvp--viewport";

/**
 * @typedef {{
 *   root: HTMLElement,
 *   scrollEl: Element,
 *   rail: HTMLElement,
 *   thumb: HTMLElement,
 *   isViewport: boolean,
 *   hideTimer: ReturnType<typeof setTimeout> | null,
 *   dragging: boolean,
 *   edgeHover: boolean,
 * }} ScrollbarHost
 */

/** @type {WeakMap<Element, ScrollbarHost>} */
const hosts = new WeakMap();

/** @type {ScrollbarHost | null} */
let viewportHost = null;

let listenersBound = false;

/**
 * @param {Element} el
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
 * @param {ScrollbarHost} host
 */
function metrics(host) {
  if (host.isViewport) {
    const html = document.documentElement;
    const body = document.body;
    return {
      scrollTop: html.scrollTop || body.scrollTop || 0,
      scrollHeight: Math.max(
        html.scrollHeight,
        body.scrollHeight,
        html.offsetHeight,
        body.offsetHeight,
      ),
      clientHeight: html.clientHeight,
    };
  }
  const el = /** @type {HTMLElement} */ (host.scrollEl);
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  };
}

/**
 * @param {ScrollbarHost} host
 */
function syncThumb(host) {
  const { scrollTop, scrollHeight, clientHeight } = metrics(host);
  if (scrollHeight <= clientHeight + 1) {
    host.rail.classList.remove("is-visible");
    host.rail.hidden = true;
    return;
  }

  host.rail.hidden = false;
  // Track is the rail itself (matches DevExpress: proportional thumb, small min).
  const track = host.rail.clientHeight || clientHeight;
  const thumbH = Math.max(18, (clientHeight / scrollHeight) * track);
  const maxTop = Math.max(0, track - thumbH);
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  const top = (scrollTop / maxScroll) * maxTop;

  host.thumb.style.height = `${thumbH}px`;
  host.thumb.style.transform = `translate3d(0, ${top}px, 0)`;
}

/**
 * @param {ScrollbarHost} host
 */
function clearHide(host) {
  if (host.hideTimer) {
    clearTimeout(host.hideTimer);
    host.hideTimer = null;
  }
}

/**
 * @param {ScrollbarHost} host
 */
function scheduleHide(host) {
  clearHide(host);
  if (host.dragging || host.edgeHover) return;
  host.hideTimer = setTimeout(() => {
    host.hideTimer = null;
    if (!host.dragging && !host.edgeHover) {
      host.rail.classList.remove("is-visible");
    }
  }, HIDE_MS);
}

/**
 * @param {ScrollbarHost} host
 */
function show(host) {
  if (document.documentElement.classList.contains("is-page-transitioning")) {
    return;
  }
  if (!canScrollY(host.isViewport ? document.documentElement : host.scrollEl)) {
    host.rail.classList.remove("is-visible");
    host.rail.hidden = true;
    return;
  }

  syncThumb(host);
  host.rail.classList.add("is-visible");
  scheduleHide(host);
}

/**
 * @param {ScrollbarHost} host
 */
function bindThumbDrag(host) {
  if (host.rail.dataset.gwBound === "1") return;
  host.rail.dataset.gwBound = "1";

  /** Offset from thumb top to where the pointer grabbed (px). */
  let grabOffset = 0;
  /** @type {number | null} */
  let activePointer = null;

  /**
   * @param {number} clientY
   */
  function scrollToPointer(clientY) {
    const { scrollHeight, clientHeight } = metrics(host);
    const rect = host.rail.getBoundingClientRect();
    const track = host.rail.clientHeight || clientHeight;
    const thumbH = host.thumb.offsetHeight || 18;
    const maxTop = Math.max(0, track - thumbH);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const top = Math.min(maxTop, Math.max(0, clientY - rect.top - grabOffset));
    const next = maxTop === 0 ? 0 : (top / maxTop) * maxScroll;

    if (host.isViewport) {
      // Direct assignment + auto behavior (class on <html>) — never smooth.
      document.documentElement.scrollTop = next;
      document.body.scrollTop = next;
    } else if (host.scrollEl instanceof HTMLElement) {
      host.scrollEl.scrollTop = next;
    }
    syncThumb(host);
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerMove(event) {
    if (!host.dragging || event.pointerId !== activePointer) return;
    event.preventDefault();
    scrollToPointer(event.clientY);
  }

  /**
   * @param {PointerEvent} event
   */
  function endDrag(event) {
    if (
      !host.dragging ||
      (activePointer !== null && event.pointerId !== activePointer)
    ) {
      return;
    }
    host.dragging = false;
    activePointer = null;
    host.rail.classList.remove("is-dragging");
    document.documentElement.classList.remove("is-scrollbar-dragging");
    try {
      host.rail.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    host.rail.removeEventListener("pointermove", onPointerMove);
    host.rail.removeEventListener("pointerup", endDrag);
    host.rail.removeEventListener("pointercancel", endDrag);
    scheduleHide(host);
  }

  host.rail.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (
      !canScrollY(host.isViewport ? document.documentElement : host.scrollEl)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    syncThumb(host);
    const thumbRect = host.thumb.getBoundingClientRect();
    const y = event.clientY;

    host.dragging = true;
    activePointer = event.pointerId;
    clearHide(host);
    host.rail.classList.add("is-visible", "is-dragging");
    document.documentElement.classList.add("is-scrollbar-dragging");

    // Hit the thumb (full rail width counts): drag from grab point.
    // Miss: jump so the thumb centers on the pointer, then drag.
    if (y >= thumbRect.top && y <= thumbRect.bottom) {
      grabOffset = y - thumbRect.top;
    } else {
      grabOffset = host.thumb.offsetHeight / 2;
      scrollToPointer(y);
    }

    host.rail.setPointerCapture(event.pointerId);
    host.rail.addEventListener("pointermove", onPointerMove);
    host.rail.addEventListener("pointerup", endDrag);
    host.rail.addEventListener("pointercancel", endDrag);
  });

  host.rail.addEventListener("pointerenter", () => {
    host.edgeHover = true;
    show(host);
    clearHide(host);
  });

  host.rail.addEventListener("pointerleave", () => {
    if (host.dragging) return;
    host.edgeHover = false;
    scheduleHide(host);
  });
}

/**
 * @param {Element} scrollEl
 * @returns {ScrollbarHost | null}
 */
function ensureHost(scrollEl) {
  const isViewport =
    scrollEl === document.documentElement || scrollEl === document.body;

  if (isViewport && viewportHost?.rail.isConnected) {
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

  let rail = isViewport
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
    scrollEl: isViewport ? document.documentElement : scrollEl,
    rail,
    thumb,
    isViewport,
    hideTimer: null,
    dragging: false,
    edgeHover: false,
  };

  hosts.set(host.scrollEl, host);
  if (isViewport) {
    hosts.set(document.documentElement, host);
    viewportHost = host;
  }

  bindThumbDrag(host);
  return host;
}

/**
 * @param {Element} scrollEl
 */
function pulse(scrollEl) {
  const el = scrollEl === document.body ? document.documentElement : scrollEl;
  const host =
    hosts.get(el) ?? (el === document.documentElement ? viewportHost : null);
  if (host?.dragging) {
    syncThumb(host);
    return;
  }
  if (!canScrollY(el) && el !== document.documentElement) return;
  const next = ensureHost(el);
  if (!next) return;
  show(next);
}

export function hideOverlayScrollbars() {
  document.querySelectorAll(".gw-scrollbar").forEach((rail) => {
    rail.classList.remove("is-visible", "is-dragging");
  });
  if (viewportHost?.hideTimer) {
    clearTimeout(viewportHost.hideTimer);
    viewportHost.hideTimer = null;
  }
}

function syncNested() {
  document.querySelectorAll(NESTED).forEach((el) => {
    if (canScrollY(el)) ensureHost(el);
  });
}

function bindTransitionHooks() {
  document.addEventListener("astro:before-preparation", () => {
    document.documentElement.classList.add("is-page-transitioning");
    hideOverlayScrollbars();
  });

  document.addEventListener("astro:after-swap", () => {
    document.documentElement.classList.add("is-page-transitioning");
    hideOverlayScrollbars();
    if (viewportHost && !viewportHost.rail.isConnected) {
      viewportHost = null;
    }
  });

  document.addEventListener("astro:page-load", () => {
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("is-page-transitioning");
      hideOverlayScrollbars();
      syncNested();
    });
  });
}

export function initOverlayScrollbars() {
  if (listenersBound) return;
  listenersBound = true;

  bindTransitionHooks();
  // Mount the viewport rail immediately so the right-edge hit strip exists
  // before the first scroll.
  const viewport = ensureHost(document.documentElement);
  if (viewport) syncThumb(viewport);
  syncNested();

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

  window.addEventListener(
    "resize",
    () => {
      const host = hosts.get(document.documentElement) ?? viewportHost;
      if (host?.rail.isConnected) {
        syncThumb(host);
        if (host.rail.classList.contains("is-visible")) scheduleHide(host);
      }
      syncNested();
    },
    { passive: true },
  );
}
