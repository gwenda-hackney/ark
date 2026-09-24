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
import { initSeriesPage, initWhatsOnPage } from "./whats-on.js";

/** @type {AbortController | null} */
let pageAbort = null;

initOverlayScrollbars();
initNavigationRestore();

/**
 * Page-scoped UI. Re-runs after Astro View Transitions swap the DOM.
 */
function initPage() {
  pageAbort?.abort();
  pageAbort = new AbortController();
  const { signal } = pageAbort;

  const header = document.getElementById("site-header");
  const menuBtn = document.getElementById("site-header-menu-btn");
  const siteNav = document.getElementById("site-header-nav");
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
    const title = document.querySelector("main .section-header");
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
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 2;
    const currentId = currentPageAnchorId(anchorSections, line, {
      atEnd,
      viewportHeight: window.innerHeight,
    });
    for (const link of siteNav.querySelectorAll(
      ".site-nav-group--page a[href^='#']",
    )) {
      const href = link.getAttribute("href") ?? "";
      const id = href.startsWith("#") ? decodeURIComponent(href.slice(1)) : "";
      const active = currentId != null && id === currentId;
      if (active) link.setAttribute("aria-current", "location");
      else if (link.getAttribute("aria-current") === "location") {
        link.removeAttribute("aria-current");
      }
    }
    const pageLabel = siteNav.querySelector(".site-nav-group--page .site-nav-label");
    if (pageLabel) {
      pageLabel.classList.toggle("is-current", currentId == null);
    }
  }

  function applyHeaderVisibility() {
    if (!header) return;
    const navOpen = siteNav?.classList.contains("is-open") ?? false;
    // Blur chrome only after the hero — never while the overlay is open
    // (avoids a different-colored strip above the full menu).
    const shouldChrome = headerScrollVisible && !navOpen;
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

  function finishNavClosing() {
    if (!siteNav?.classList.contains("is-closing")) return;
    siteNav.classList.remove("is-closing");
    if (navClosingTimer != null) {
      clearTimeout(navClosingTimer);
      navClosingTimer = null;
    }
    applyHeaderVisibility();
  }

  function closeSiteNav() {
    if (!siteNav) return;
    const wasOpen = siteNav.classList.contains("is-open");
    siteNav.classList.remove("is-open");
    menuBtn?.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    menuBtn?.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("site-nav-open");

    if (wasOpen) {
      // Keep overlay geometry while opacity fades so desktop inline styles
      // cannot match :not(.is-open) and flash the horizontal bar.
      siteNav.classList.add("is-closing");
      if (navClosingTimer != null) clearTimeout(navClosingTimer);
      const onEnd = (event) => {
        if (event.target !== siteNav || event.propertyName !== "opacity")
          return;
        siteNav.removeEventListener("transitionend", onEnd);
        finishNavClosing();
      };
      siteNav.addEventListener("transitionend", onEnd);
      navClosingTimer = setTimeout(() => {
        siteNav.removeEventListener("transitionend", onEnd);
        finishNavClosing();
      }, 450);
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
        siteNav.classList.remove("is-closing");
        if (navClosingTimer != null) {
          clearTimeout(navClosingTimer);
          navClosingTimer = null;
        }
        // Force a closed frame so opacity can animate 0 → 1 (re-open during
        // close, or desktop parked bar, otherwise snaps with no transition).
        void siteNav.offsetHeight;
        requestAnimationFrame(() => {
          siteNav.classList.add("is-open");
          menuBtn.classList.add("is-open");
          menuBtn.setAttribute("aria-expanded", "true");
          menuBtn.setAttribute("aria-label", "Close menu");
          document.body.classList.add("site-nav-open");
          applyHeaderVisibility();
        });
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

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener(
        "click",
        (event) => {
          // Home hash clicks are already scrolled by the capture listener.
          if (!event.defaultPrevented) {
            const href = link.getAttribute("href") ?? "";
            if (href.startsWith("#") && href.length > 1) {
              const sectionId = decodeURIComponent(href.slice(1));
              const target = document.getElementById(sectionId);
              if (target) {
                event.preventDefault();
                const nextUrl = buildSectionUrl(sectionId);
                const currentUrl = `${location.pathname}${location.search}${location.hash}`;
                if (nextUrl !== currentUrl) {
                  replacePageUrl(nextUrl);
                }
                const prefersReduced = window.matchMedia(
                  "(prefers-reduced-motion: reduce)",
                ).matches;
                target.scrollIntoView({
                  behavior: prefersReduced ? "auto" : "smooth",
                  block: "start",
                });
              }
            }
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
  // Local What's on hides the diary until the live read sets data-live.
  // Page scripts do not re-run on View Transitions back-nav.
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
