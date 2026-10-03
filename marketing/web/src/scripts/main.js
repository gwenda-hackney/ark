import { initSignup, initSignupAnchors } from "./signup.js";
import {
  initNavigationRestore,
  whenNavigationReady,
} from "./navigation-restore.js";
import { initReveal } from "./reveal.js";
import { initHeroReveal } from "./hero-reveal.js";
import { replacePageUrl } from "./history-state.js";
import { buildSectionUrl, initSectionHash } from "./section-hash.js";
import { initMenuToc } from "./menu-toc.js";
import { initOverlayScrollbars } from "./scrollbar.js";
import { initContactForm, initContactFormSubmitted } from "./contact-form.js";
import { currentPageAnchorId, pageAnchorSections } from "./page-anchors.js";
import { initSchedulePage } from "./schedule.js";
import { initHomeNext, initSeriesPage, initWhatsOnPage } from "./whats-on.js";
import { initGallery } from "./gallery.js";

/** @type {AbortController | null} */
let pageAbort = null;

initOverlayScrollbars();
initNavigationRestore();
initGallery();

/**
 * Page-scoped UI. Re-runs after Astro View Transitions swap the DOM.
 */
/** Puts the home contact rule in the gap between the two text blocks. */
function placeHomeContactRule() {
  const paths = document.querySelector(".signup .contact-hub-paths");
  const rule = paths?.querySelector(".contact-hub-rule");
  const cols = paths?.querySelectorAll(".contact-hub-path");
  if (
    !(paths instanceof HTMLElement) ||
    !(rule instanceof HTMLElement) ||
    !cols ||
    cols.length < 2
  ) {
    return;
  }
  if (getComputedStyle(rule).position !== "absolute") {
    rule.style.left = "";
    return;
  }
  const edge = (col, side) => {
    let value = side === "right" ? 0 : Infinity;
    for (const child of col.children) {
      const box = child.getBoundingClientRect();
      if (box.width === 0) continue;
      value =
        side === "right"
          ? Math.max(value, box.right)
          : Math.min(value, box.left);
    }
    return value;
  };
  const left = edge(cols[0], "right");
  const right = edge(cols[1], "left");
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left)
    return;
  const origin = paths.getBoundingClientRect().left;
  rule.style.left = `${(left + right) / 2 - origin}px`;
}

function initPage() {
  pageAbort?.abort();
  pageAbort = new AbortController();
  const { signal } = pageAbort;

  document.querySelectorAll("[data-site-back]").forEach((link) => {
    link.addEventListener(
      "click",
      (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        if (window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
      },
      { signal },
    );
  });

  const header = document.getElementById("site-header");
  const menuBtn = document.getElementById("site-header-menu-btn");
  const siteNav = document.getElementById("site-header-nav");
  if (siteNav && !siteNav.classList.contains("is-open")) {
    document.body.classList.remove("site-nav-open");
  }
  const hero = document.getElementById("hero");
  const collapsedNav =
    header?.classList.contains("site-header--collapsed") ?? false;
  const scrollTop = document.getElementById("scroll-top");
  const mobileNavQuery = window.matchMedia("(max-width: 640px)");
  /** Matches the CSS bar breakpoint (min-width: 1100px). */
  const navBarQuery = window.matchMedia("(max-width: 1099px)");

  let scrollTicking = false;
  let headerScrollVisible = false;
  let headerShowAt = 120;
  let headerHideAt = 40;

  const heroHasLogo = Boolean(hero?.querySelector(".hero-logo"));
  if (heroHasLogo) header?.classList.add("awaits-hero");

  function updateHeaderThresholds() {
    if (hero && heroHasLogo) {
      // The hero already shows the wordmark. Bring the bar logo in once
      // that hero has passed the bar.
      const showAt = Math.max(
        0,
        hero.offsetTop + hero.offsetHeight - (header?.offsetHeight ?? 0),
      );
      headerShowAt = showAt;
      headerHideAt = showAt * 0.92;
      return;
    }
    if (hero) {
      const showRatio = mobileNavQuery.matches ? 0.2 : 0.5;
      const showAt = hero.offsetHeight * showRatio;
      headerShowAt = showAt;
      headerHideAt = showAt * 0.85;
      return;
    }
    if (!collapsedNav || !header) return;
    // Slide quick links in once the page title has passed the bar.
    const title = document.querySelector(
      "main .page-header, main .section-header",
    );
    const titleBottom = title
      ? title.getBoundingClientRect().bottom + window.scrollY
      : 200;
    const showAt = Math.max(80, titleBottom - header.offsetHeight);
    headerShowAt = showAt;
    headerHideAt = showAt * 0.85;
  }

  /**
   * Underline the section that has reached the bar. Does not write the hash.
   * In the hero, before any section arrives, nothing is current.
   * Targets are read from the document each time: the diary replaces its
   * headings after the first paint.
   */
  function updateCurrentSection() {
    if (!siteNav) return;
    const anchorSections = pageAnchorSections(siteNav);
    const line = (header?.offsetHeight ?? 0) + 24;
    const atEnd =
      window.scrollY > 2 &&
      window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 2;
    const currentId = currentPageAnchorId(anchorSections, line, {
      atEnd,
      viewportHeight: window.innerHeight,
    });
    for (const link of document.querySelectorAll(
      "#site-header-nav .site-nav-group--page a[href^='#'], .site-header-bar a[href^='#']",
    )) {
      const href = link.getAttribute("href") ?? "";
      const id = href.startsWith("#") ? decodeURIComponent(href.slice(1)) : "";
      const active = currentId != null && id === currentId;
      if (active) link.setAttribute("aria-current", "location");
      else if (link.getAttribute("aria-current") === "location") {
        link.removeAttribute("aria-current");
      }
    }
    const pageLabel = siteNav.querySelector(
      ".site-nav-group--page .site-nav-label",
    );
    if (pageLabel) {
      pageLabel.classList.toggle("is-current", currentId == null);
    }
  }

  function applyHeaderVisibility() {
    if (!header) return;
    // Keep the scrolled hairline while the menu is open. Dropping that 1px
    // border shifts the wordmark.
    const shouldChrome = headerScrollVisible;
    // The wordmark stays in the bar. Page links still wait until the title
    // has passed, same mark as the frosted chrome.
    header.classList.toggle("scrolled", shouldChrome);
    header.classList.toggle("has-logo", headerScrollVisible);
  }

  function onScrollFrame() {
    const y = window.scrollY;
    if (!headerScrollVisible && y > headerShowAt) headerScrollVisible = true;
    if (headerScrollVisible && y < headerHideAt) headerScrollVisible = false;
    applyHeaderVisibility();
    updateCurrentSection();
    scrollTicking = false;
  }

  updateHeaderThresholds();
  window.addEventListener(
    "resize",
    () => {
      updateHeaderThresholds();
      onScrollFrame();
    },
    { passive: true, signal },
  );

  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTicking) {
        scrollTicking = true;
        requestAnimationFrame(onScrollFrame);
      }
    },
    { passive: true, signal },
  );

  document.addEventListener("gwenda:page-anchors", () => onScrollFrame(), {
    signal,
  });

  if (header) {
    whenNavigationReady(() => onScrollFrame());
  }

  function initScrollHint() {
    const scrollHint = document.querySelector(".hero-scroll-hint");
    if (!scrollHint || !hero) return;
    const fadeScrollHint = () => {
      scrollHint.classList.toggle("is-faded", window.scrollY > 48);
    };
    window.addEventListener("scroll", fadeScrollHint, {
      passive: true,
      signal,
    });
    fadeScrollHint();
  }

  function initHeroParallax() {
    const heroMedia = document.querySelector(".hero-media");
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!hero || !heroMedia || prefersReducedMotion) return;

    let parallaxTicking = false;

    const onHeroParallax = () => {
      const rect = hero.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const progress = Math.min(
          1,
          Math.max(0, -rect.top / (rect.height * 0.85)),
        );
        heroMedia.style.transform = `translate3d(0, ${progress * 28}px, 0)`;
      }
      parallaxTicking = false;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (!parallaxTicking) {
          parallaxTicking = true;
          requestAnimationFrame(onHeroParallax);
        }
      },
      { passive: true, signal },
    );

    onHeroParallax();
  }

  if (hero) {
    whenNavigationReady(() => {
      const heroObserver = new IntersectionObserver(
        ([entry]) => {
          scrollTop?.classList.toggle("is-visible", !entry.isIntersecting);
        },
        { threshold: 0 },
      );
      heroObserver.observe(hero);
      signal.addEventListener("abort", () => heroObserver.disconnect());
    });
  }

  /** @type {ReturnType<typeof setTimeout> | null} */
  let navClosingTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let navCoverTimer = null;

  function finishNavClosing() {
    if (!siteNav?.classList.contains("is-closing")) return;
    siteNav.classList.remove("is-closing", "is-leaving");
    document.body.classList.remove("site-nav-open", "site-nav-covering");
    if (navClosingTimer != null) {
      clearTimeout(navClosingTimer);
      navClosingTimer = null;
    }
    applyHeaderVisibility();
  }

  /**
   * @param {{ hold?: boolean }} [options]
   * hold: keep the scrim up. Used when a link is about to change pages, so
   * home cannot show through while the next page loads.
   */
  function closeSiteNav({ hold = false } = {}) {
    if (!siteNav) return;
    const wasOpen = siteNav.classList.contains("is-open");
    siteNav.classList.remove("is-open");
    if (navCoverTimer != null) {
      clearTimeout(navCoverTimer);
      navCoverTimer = null;
    }
    menuBtn?.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    menuBtn?.setAttribute("aria-label", "Open menu");

    if (wasOpen) {
      // Keep overlay geometry while the words fade, then the scrim.
      // Desktop inline styles must not match :not(.is-open) during that.
      siteNav.classList.add("is-closing");
      siteNav.classList.toggle("is-leaving", hold);
      if (hold) return;
      if (navClosingTimer != null) clearTimeout(navClosingTimer);
      const onEnd = (event) => {
        if (event.target !== siteNav || event.propertyName !== "opacity")
          return;
        siteNav.removeEventListener("transitionend", onEnd);
        finishNavClosing();
      };
      siteNav.addEventListener("transitionend", onEnd);
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      navClosingTimer = setTimeout(
        () => {
          siteNav.removeEventListener("transitionend", onEnd);
          finishNavClosing();
        },
        reduced ? 0 : 560,
      );
    } else {
      document.body.classList.remove("site-nav-open");
    }

    applyHeaderVisibility();
  }

  if (menuBtn && siteNav) {
    menuBtn.addEventListener(
      "click",
      () => {
        if (siteNav.classList.contains("is-open")) {
          closeSiteNav();
          return;
        }
        if (document.body.classList.contains("site-nav-covering")) {
          document.body.classList.remove("site-nav-covering");
          if (navCoverTimer != null) {
            clearTimeout(navCoverTimer);
            navCoverTimer = null;
          }
          return;
        }
        siteNav.classList.remove("is-closing", "is-leaving");
        if (navClosingTimer != null) {
          clearTimeout(navClosingTimer);
          navClosingTimer = null;
        }
        // Page and header links fade first. The full menu starts after that.
        document.body.classList.add("site-nav-covering");
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        navCoverTimer = setTimeout(
          () => {
            navCoverTimer = null;
            if (!document.body.classList.contains("site-nav-covering")) return;
            void siteNav.offsetHeight;
            siteNav.classList.add("is-open");
            menuBtn.classList.add("is-open");
            menuBtn.setAttribute("aria-expanded", "true");
            menuBtn.setAttribute("aria-label", "Close menu");
            document.body.classList.add("site-nav-open");
            applyHeaderVisibility();
          },
          reduced ? 0 : 280,
        );
      },
      { signal },
    );

    siteNav.addEventListener(
      "click",
      (e) => {
        if (e.target === siteNav) closeSiteNav();
      },
      { signal },
    );

    /**
     * Bar links sit outside the overlay. Native hash jumps hide the heading
     * under the fixed bar, and do nothing when the hash is already set.
     */
    function scrollToPageAnchor(link, event) {
      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("#") || href.length < 2 || event.defaultPrevented) {
        return false;
      }
      const sectionId = decodeURIComponent(href.slice(1));
      const target = document.getElementById(sectionId);
      if (!target) return false;
      event.preventDefault();
      const nextUrl = buildSectionUrl(sectionId);
      const currentUrl = `${location.pathname}${location.search}${location.hash}`;
      if (nextUrl !== currentUrl) replacePageUrl(nextUrl);
      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      target.scrollIntoView({
        behavior: prefersReduced ? "auto" : "smooth",
        block: "start",
      });
      return true;
    }

    document
      .querySelectorAll(".site-header-bar a[href^='#']")
      .forEach((link) => {
        link.addEventListener(
          "click",
          (event) => {
            scrollToPageAnchor(link, event);
          },
          { signal },
        );
      });

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener(
        "click",
        (event) => {
          const href = link.getAttribute("href") ?? "";
          // Home hash clicks are already scrolled by the capture listener.
          scrollToPageAnchor(link, event);
          const leavesPage =
            Boolean(href) &&
            !href.startsWith("#") &&
            !href.startsWith("mailto:") &&
            !href.startsWith("tel:");
          const plainClick =
            event.button === 0 &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.shiftKey &&
            !event.altKey;
          if (
            leavesPage &&
            plainClick &&
            !event.defaultPrevented &&
            siteNav.classList.contains("is-open")
          ) {
            event.preventDefault();
            event.stopPropagation();
            closeSiteNav({ hold: true });
            const reduced = window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches;
            const go = () => {
              if (link.hasAttribute("data-astro-reload")) {
                location.assign(href);
                return;
              }
              import("astro:transitions/client")
                .then(({ navigate }) => navigate(href))
                .catch(() => {
                  siteNav.classList.remove("is-leaving");
                  location.assign(href);
                });
            };
            if (reduced) go();
            else window.setTimeout(go, 200);
            return;
          }
          closeSiteNav();
        },
        { signal },
      );
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") closeSiteNav();
      },
      { signal },
    );

    mobileNavQuery.addEventListener(
      "change",
      () => {
        closeSiteNav();
        onScrollFrame();
      },
      { signal },
    );

    navBarQuery.addEventListener(
      "change",
      () => {
        closeSiteNav();
        onScrollFrame();
      },
      { signal },
    );
  }

  initReveal();
  // Hero entrance must re-run after View Transitions — Hero.astro's module
  // script only executes the first time that page is visited in the session.
  initHeroReveal();
  // Baked diary paints first. The live read corrects the clock.
  // Local hides that bake until data-live is set.
  // Page scripts do not re-run on View Transitions back-nav.
  initHomeNext();
  initWhatsOnPage();
  initSeriesPage();
  initSchedulePage();

  let teardownSectionHash = () => {};
  let teardownMenuToc = () => {};
  signal.addEventListener("abort", () => {
    teardownSectionHash();
    teardownMenuToc();
  });

  whenNavigationReady(() => {
    initScrollHint();
    initHeroParallax();
    teardownSectionHash = initSectionHash();
    teardownMenuToc = initMenuToc();
  });

  const signupForm = document.getElementById("signup-form");
  if (
    signupForm instanceof HTMLFormElement &&
    signupForm.dataset.gwBound !== "1"
  ) {
    signupForm.dataset.gwBound = "1";
    initSignup(signupForm);
  }
  initSignupAnchors();
  placeHomeContactRule();
  window.addEventListener("resize", placeHomeContactRule, { signal });
  document.fonts?.ready.then(placeHomeContactRule);

  if (
    document.getElementById("contact-form") ||
    document.querySelector("[data-play-parallax]")
  ) {
    initContactForm();
  }
  if (document.getElementById("contact-success")) {
    initContactFormSubmitted();
  }
}

document.addEventListener("astro:page-load", initPage);
// Also run immediately: covers first paint if page-load already fired,
// and browsers without the View Transitions router. AbortController
// makes a double call on first load harmless.
initPage();
