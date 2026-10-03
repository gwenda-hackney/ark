/**
 * Event galleries (#30): "Show all" reveals the photos past the first rows,
 * and a tapped photo opens large, with arrows, swipe and Escape. Listens on
 * the document, so it works on series and night pages, rendered on request.
 */
let installed = false;

export function initGallery(doc = document) {
  if (installed) return;
  installed = true;
  doc.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const more = target?.closest("[data-gallery-more]");
    if (more) {
      const list = more
        .closest(".series-gallery")
        ?.querySelector(".series-gallery-list");
      for (const item of list?.querySelectorAll(
        ".series-gallery-item[hidden]",
      ) || [])
        item.hidden = false;
      more.remove();
      return;
    }
    const link = target?.closest(".series-gallery-item a");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const links = [
      ...link
        .closest(".series-gallery-list")
        .querySelectorAll(".series-gallery-item a"),
    ];
    event.preventDefault();
    openLightbox(doc, links, links.indexOf(link));
  });
}

function openLightbox(doc, links, start) {
  const dialog = doc.createElement("dialog");
  dialog.className = "gallery-lightbox";
  dialog.setAttribute("aria-label", "Photo");
  dialog.innerHTML = `
    <img class="gallery-lightbox-image" alt="" />
    <button class="gallery-lightbox-close" type="button" aria-label="Close">×</button>
    <button class="gallery-lightbox-prev" type="button" aria-label="Previous photo">‹</button>
    <button class="gallery-lightbox-next" type="button" aria-label="Next photo">›</button>
    <p class="gallery-lightbox-count" aria-live="polite"></p>`;
  const image = dialog.querySelector("img");
  const count = dialog.querySelector(".gallery-lightbox-count");
  let index = start;
  const show = (next) => {
    index = (next + links.length) % links.length;
    const link = links[index];
    image.src = link.dataset.full || link.href;
    image.alt = link.querySelector("img")?.alt || "";
    count.textContent =
      links.length > 1 ? `${index + 1} / ${links.length}` : "";
  };
  const close = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog
    .querySelector(".gallery-lightbox-close")
    .addEventListener("click", close);
  dialog
    .querySelector(".gallery-lightbox-prev")
    .addEventListener("click", () => show(index - 1));
  dialog
    .querySelector(".gallery-lightbox-next")
    .addEventListener("click", () => show(index + 1));
  // A tap on the backdrop (not the photo or a button) closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
  let startX = null;
  dialog.addEventListener("pointerdown", (event) => (startX = event.clientX));
  dialog.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
  if (links.length < 2) {
    dialog.querySelector(".gallery-lightbox-prev").hidden = true;
    dialog.querySelector(".gallery-lightbox-next").hidden = true;
  }
  doc.body.append(dialog);
  show(start);
  dialog.showModal();
}
