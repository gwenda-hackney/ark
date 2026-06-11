import { initCountdown } from "./countdown.js";
import { initSignup, initSignupAnchors } from "./signup.js";

/* Header + nav */
const header = document.getElementById("site-header");
const menuBtn = document.getElementById("site-header-menu-btn");
const siteNav = document.getElementById("site-header-nav");
const hero = document.getElementById("hero");
const scrollTop = document.getElementById("scroll-top");
const mobileNavQuery = window.matchMedia("(max-width: 640px)");
let scrollTicking = false;
let headerVisible = false;
let headerShowAt = 120;
let headerHideAt = 40;

function updateHeaderThresholds() {
  if (!hero) return;
  const halfHero = hero.offsetHeight * 0.5;
  headerShowAt = halfHero;
  headerHideAt = halfHero * 0.85;
}

function onScrollFrame() {
  const y = window.scrollY;
  let shouldShow = headerVisible;
  if (!headerVisible && y > headerShowAt) shouldShow = true;
  if (headerVisible && y < headerHideAt) shouldShow = false;

  if (header && shouldShow !== headerVisible) {
    headerVisible = shouldShow;
    header.classList.toggle("visible", shouldShow);
    header.classList.toggle("scrolled", shouldShow);
    siteNav?.classList.toggle("visible", shouldShow);
  }

  scrollTicking = false;
}

updateHeaderThresholds();
window.addEventListener(
  "resize",
  () => {
    updateHeaderThresholds();
    onScrollFrame();
  },
  { passive: true },
);

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
if (hero) {
  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      scrollTop?.classList.toggle("is-visible", !entry.isIntersecting);
    },
    { threshold: 0 },
  );
  heroObserver.observe(hero);
}

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

  siteNav.addEventListener("click", (e) => {
    if (e.target === siteNav) closeMobileNav();
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileNav);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileNav();
  });

  mobileNavQuery.addEventListener("change", (e) => {
    if (!e.matches) closeMobileNav();
    if (e.matches) siteNav?.classList.remove("visible");
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
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -32px 0px" },
  );
  revealEls.forEach((el) => revealObserver.observe(el));
}

/* Hero scroll hint — fade once user scrolls */
const scrollHint = document.querySelector(".hero-scroll-hint");
if (scrollHint && hero) {
  const fadeScrollHint = () => {
    scrollHint.classList.toggle("is-faded", window.scrollY > 48);
  };
  window.addEventListener("scroll", fadeScrollHint, { passive: true });
  fadeScrollHint();
}

/* Hero — subtle depth parallax on the image */
const heroMedia = document.querySelector(".hero-media");
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

if (hero && heroMedia && !prefersReducedMotion) {
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
    { passive: true },
  );
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

    cta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cta.click();
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".menu-tease-cta")) return;
    menuTeaseCtas.forEach((cta) => cta.classList.remove("is-revealed"));
  });
}
