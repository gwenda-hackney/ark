import { initSignup, initSignupAnchors } from "./signup.js";
import { initNavigationRestore, whenNavigationReady } from "./navigation-restore.js";
import { initReveal } from "./reveal.js";
import { initHeroReveal } from "./hero-reveal.js";
import { initSectionHash } from "./section-hash.js";
import { initMenuToc } from "./menu-toc.js";
import { initOverlayScrollbars } from "./scrollbar.js";
import { initContactForm, initContactFormSubmitted } from "./contact-form.js";

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
  let headerHoverPinned = false;
  let headerShowAt = 120;
  let headerHideAt = 40;
  const HEADER_HOVER_ZONE_PX = 72;

  function updateHeaderThresholds() {
    if (!hero) return;
    // Desktop: half hero. Mobile: earlier so the hamburger (and Contact) appear sooner.
    const showRatio = mobileNavQuery.matches ? 0.2 : 0.5;
    const showAt = hero.offsetHeight * showRatio;
    headerShowAt = showAt;
    headerHideAt = showAt * 0.85;
  }

  function applyHeaderVisibility() {
    if (!header) return;
    const mobile = mobileNavQuery.matches;
    // Mobile has no hover reveal — keep the hamburger reachable at the top
    // of the page. Desktop still uses scroll + top-of-viewport hover.
    const shouldShow = mobile || headerHoverPinned || headerScrollVisible;
    // Light gradient over the hero; blur chrome only after scroll (or desktop hover).
    const shouldChrome =
      headerScrollVisible || (!mobile && headerHoverPinned);

    header.classList.toggle("visible", shouldShow);
    header.classList.toggle("scrolled", shouldChrome);

    if (!mobile) {
      siteNav?.classList.toggle("visible", shouldShow);
    }
  }

  function onScrollFrame() {
    const y = window.scrollY;
    if (!headerScrollVisible && y > headerShowAt) headerScrollVisible = true;
    if (headerScrollVisible && y < headerHideAt) headerScrollVisible = false;
    applyHeaderVisibility();
    scrollTicking = false;
  }

  function pointerOverHeaderChrome(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    return Boolean(el?.closest("#site-header, #site-header-nav"));
  }

  function onHeaderPointerMove(e) {
    if (mobileNavQuery.matches || !header) return;
    const next =
      e.clientY <= HEADER_HOVER_ZONE_PX ||
      pointerOverHeaderChrome(e.clientX, e.clientY);
    if (next === headerHoverPinned) return;
    headerHoverPinned = next;
    applyHeaderVisibility();
  }

  function onHeaderPointerLeave() {
    if (mobileNavQuery.matches || !headerHoverPinned) return;
    headerHoverPinned = false;
    applyHeaderVisibility();
  }

  updateHeaderThresholds();
  window.addEventListener(
    "resize",
    () => {
      updateHeaderThresholds();
      if (mobileNavQuery.matches) headerHoverPinned = false;
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
    window.addEventListener("pointermove", onHeaderPointerMove, {
      passive: true,
      signal,
    });
    document.documentElement.addEventListener(
      "pointerleave",
      onHeaderPointerLeave,
      { signal },
    );
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

  function closeMobileNav() {
    siteNav?.classList.remove("is-open");
    menuBtn?.classList.remove("is-open");
    menuBtn?.setAttribute("aria-expanded", "false");
    menuBtn?.setAttribute("aria-label", "Open menu");
    document.body.classList.remove("site-nav-open");
  }

  if (menuBtn && siteNav) {
    menuBtn.addEventListener(
      "click",
      () => {
        const isOpen = siteNav.classList.toggle("is-open");
        menuBtn.classList.toggle("is-open", isOpen);
        menuBtn.setAttribute("aria-expanded", String(isOpen));
        menuBtn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
        document.body.classList.toggle("site-nav-open", isOpen);
      },
      { signal },
    );

    siteNav.addEventListener(
      "click",
      (e) => {
        if (e.target === siteNav) closeMobileNav();
      },
      { signal },
    );

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMobileNav, { signal });
    });

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") closeMobileNav();
      },
      { signal },
    );

    mobileNavQuery.addEventListener(
      "change",
      (e) => {
        if (!e.matches) closeMobileNav();
        if (e.matches) siteNav?.classList.remove("visible");
        onScrollFrame();
      },
      { signal },
    );
  }

  initReveal();
  // Hero entrance must re-run after View Transitions — Hero.astro's module
  // script only executes the first time that page is visited in the session.
  initHeroReveal();

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
