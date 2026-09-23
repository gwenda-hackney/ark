import { initSignup, initSignupAnchors } from "./signup.js";
import { initNavigationRestore, whenNavigationReady } from "./navigation-restore.js";
import { initReveal } from "./reveal.js";
import { initHeroReveal } from "./hero-reveal.js";
import { initSectionHash } from "./section-hash.js";
import { initMenuToc } from "./menu-toc.js";
import { initOverlayScrollbars } from "./scrollbar.js";
import { initContactForm, initContactFormSubmitted } from "./contact-form.js";
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
  const scrollTop = document.getElementById("scroll-top");
  const mobileNavQuery = window.matchMedia("(max-width: 640px)");

  let scrollTicking = false;
  let headerScrollVisible = false;
  let headerShowAt = 120;
  let headerHideAt = 40;

  function updateHeaderThresholds() {
    if (!hero) return;
    // Desktop: half hero. Mobile: earlier so the logo appears sooner.
    const showRatio = mobileNavQuery.matches ? 0.2 : 0.5;
    const showAt = hero.offsetHeight * showRatio;
    headerShowAt = showAt;
    headerHideAt = showAt * 0.85;
  }

  function applyHeaderVisibility() {
    if (!header) return;
    const mobile = mobileNavQuery.matches;
    const navOpen = siteNav?.classList.contains("is-open") ?? false;
    // Blur chrome only after the hero — never while the overlay is open
    // (avoids a different-colored strip above the full menu).
    const shouldChrome = headerScrollVisible && !navOpen;
    // Nav logo only after the hero logo is gone (same scroll mark).
    const showLogo = !hero || headerScrollVisible;

    // Desktop past hero uses inline links — close overlay first so it can
    // fade out without flashing the horizontal bar mid-dismiss.
    if (showLogo && !mobile && navOpen) {
      closeSiteNav();
      return;
    }

    header.classList.toggle("scrolled", shouldChrome);
    header.classList.toggle("has-logo", showLogo);
  }

  function onScrollFrame() {
    const y = window.scrollY;
    if (!headerScrollVisible && y > headerShowAt) headerScrollVisible = true;
    if (headerScrollVisible && y < headerHideAt) headerScrollVisible = false;
    applyHeaderVisibility();
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

  if (header) {
    whenNavigationReady(() => onScrollFrame());
  }

  function initScrollHint() {
    const scrollHint = document.querySelector(".hero-scroll-hint");
    if (!scrollHint || !hero) return;
    const fadeScrollHint = () => {
      scrollHint.classList.toggle("is-faded", window.scrollY > 48);
    };
    window.addEventListener("scroll", fadeScrollHint, { passive: true, signal });
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
        if (event.target !== siteNav || event.propertyName !== "opacity") return;
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
      link.addEventListener("click", closeSiteNav, { signal });
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
  }

  initReveal();
  // Hero entrance must re-run after View Transitions — Hero.astro's module
  // script only executes the first time that page is visited in the session.
  initHeroReveal();
  // Staging What's on hides the diary until live refresh sets data-live.
  // Page scripts do not re-run on View Transitions back-nav.
  initWhatsOnPage();
  initSeriesPage();

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
  if (signupForm instanceof HTMLFormElement && signupForm.dataset.gwBound !== "1") {
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
