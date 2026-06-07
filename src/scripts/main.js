import { initCountdown } from "./countdown.js";
import { initSignup, initSignupAnchors } from "./signup.js";

/* Hero image reveal */
const heroImage = document.querySelector(".hero-image");

if (heroImage) {
  const revealHero = () => {
    requestAnimationFrame(() => heroImage.classList.add("loaded"));
  };

  heroImage.addEventListener(
    "animationend",
    () => {
      heroImage.classList.remove("loaded");
      heroImage.classList.add("revealed");
    },
    { once: true },
  );

  if (heroImage.complete && heroImage.naturalHeight !== 0) {
    revealHero();
  } else {
    heroImage.addEventListener("load", revealHero, { once: true });
  }
}

/* Single rAF-throttled scroll handler */
const header = document.getElementById("site-header");
const mobileNavQuery = window.matchMedia("(max-width: 640px)");
let scrollTicking = false;
let headerVisible = false;
const HEADER_SHOW_AT = 120;
const HEADER_HIDE_AT = 40;

function onScrollFrame() {
  const y = window.scrollY;
  const isMobile = mobileNavQuery.matches;

  if (isMobile) {
    if (!headerVisible) {
      headerVisible = true;
      header?.classList.add("visible");
    }
    header?.classList.toggle("scrolled", y > HEADER_HIDE_AT);
  } else {
    let shouldShow = headerVisible;
    if (!headerVisible && y > HEADER_SHOW_AT) shouldShow = true;
    if (headerVisible && y < HEADER_HIDE_AT) shouldShow = false;

    if (header && shouldShow !== headerVisible) {
      headerVisible = shouldShow;
      header.classList.toggle("visible", shouldShow);
      header.classList.toggle("scrolled", shouldShow);
    }
  }

  scrollTicking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(onScrollFrame);
    }
  },
  { passive: true },
);

if (header) onScrollFrame();

/* Floating back-to-top — after hero */
const hero = document.getElementById("hero");
const scrollTop = document.getElementById("scroll-top");

if (hero && scrollTop) {
  const scrollTopObserver = new IntersectionObserver(
    ([entry]) => {
      scrollTop.classList.toggle("is-visible", !entry.isIntersecting);
    },
    { threshold: 0 },
  );
  scrollTopObserver.observe(hero);
}

/* Mobile nav */
const menuBtn = document.getElementById("site-header-menu-btn");
const siteNav = document.getElementById("site-header-nav");

function closeMobileNav() {
  siteNav?.classList.remove("is-open");
  menuBtn?.classList.remove("is-open");
  menuBtn?.setAttribute("aria-expanded", "false");
  menuBtn?.setAttribute("aria-label", "Open menu");
  document.body.classList.remove("site-nav-open");
}

if (menuBtn && siteNav) {
  menuBtn.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    menuBtn.classList.toggle("is-open", isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    menuBtn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    document.body.classList.toggle("site-nav-open", isOpen);
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileNav);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
  });

  mobileNavQuery.addEventListener("change", (e) => {
    if (!e.matches) closeMobileNav();
    onScrollFrame();
  });
}

/* Countdown */
const countdown = document.getElementById("countdown");
if (countdown) {
  initCountdown(countdown, Number(countdown.dataset.opening));
}

/* Scroll reveal */
const revealEls = document.querySelectorAll(".reveal");
if (revealEls.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );
  revealEls.forEach((el) => observer.observe(el));
}

/* Email signup */
const signupForm = document.getElementById("signup-form");
if (signupForm) initSignup(signupForm);
initSignupAnchors();

/* Menu tease — touch: tap to reveal */
const menuTeaseCtas = document.querySelectorAll(".menu-tease-cta");
const hasHover = window.matchMedia("(hover: hover)").matches;

if (menuTeaseCtas.length && !hasHover) {
  menuTeaseCtas.forEach((cta) => {
    cta.addEventListener("click", () => {
      const revealed = cta.classList.contains("is-revealed");
      menuTeaseCtas.forEach((other) => other.classList.remove("is-revealed"));
      if (!revealed) cta.classList.add("is-revealed");
    });
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".menu-tease-cta")) return;
    menuTeaseCtas.forEach((cta) => cta.classList.remove("is-revealed"));
  });
}
