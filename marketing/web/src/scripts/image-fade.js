/**
 * Event photos: while one loads, its card shows a tiny blurred copy (the
 * `--placeholder` on `.event-media`, made by tinyImageUrl in lib/event-card.js),
 * then the photo fades in over it. Photos already loaded show straight away.
 */
export function fadeInEventPhotos(root = document) {
  for (const img of root.querySelectorAll(".event-media img.event-hero")) {
    if (img.complete && img.naturalWidth) continue;
    const media = img.closest(".event-media");
    if (!media || media.classList.contains("is-loading")) continue;
    media.classList.add("is-loading");
    const done = () => media.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
}
