import { isRestoredNavigation } from "./navigation-restore.js";

export { isRestoredNavigation };

export function shouldSkipRevealAnimation() {
  return isRestoredNavigation();
}

/**
 * Scroll-reveal entrance animations. On back/forward navigation the page is
 * shown in its final state (see navigation-restore.js), so we skip the
 * observer entirely and leave everything visible.
 */
export function initReveal() {
  const revealEls = document.querySelectorAll(".reveal");
  if (!revealEls.length) return;

  if (shouldSkipRevealAnimation()) {
    revealEls.forEach((el) => el.classList.add("visible"));
    return;
  }

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

  revealEls.forEach((el) => {
    if (el.classList.contains("visible")) return;
    revealObserver.observe(el);
  });
}
