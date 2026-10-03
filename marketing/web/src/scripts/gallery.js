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

const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

function openLightbox(doc, links, start) {
  const win = doc.defaultView || window;
  const reduced = win.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dialog = doc.createElement("dialog");
  dialog.className = "gallery-lightbox";
  dialog.setAttribute("aria-label", "Photo");
  dialog.innerHTML = `
    <div class="gallery-lightbox-stage"></div>
    <button class="gallery-lightbox-close" type="button" aria-label="Close">×</button>
    <button class="gallery-lightbox-prev" type="button" aria-label="Previous photo">‹</button>
    <button class="gallery-lightbox-next" type="button" aria-label="Next photo">›</button>
    <p class="gallery-lightbox-count" aria-live="polite"></p>`;
  const stage = dialog.querySelector(".gallery-lightbox-stage");
  const count = dialog.querySelector(".gallery-lightbox-count");
  const wrap = (i) => (i + links.length) % links.length;
  const srcOf = (i) => links[i].dataset.full || links[i].href;
  let index = start;
  let image = null;
  let queue = Promise.resolve();

  /** A decoded photo, ready to show without a flash. */
  const photo = async (i) => {
    const img = doc.createElement("img");
    img.className = "gallery-lightbox-image";
    img.alt = links[i].querySelector("img")?.alt || "";
    img.draggable = false;
    img.src = srcOf(i);
    await img.decode().catch(() => {});
    return img;
  };
  // The photos either side load in the background, so a slide never waits.
  const preload = () => {
    if (links.length < 2) return;
    for (const i of [wrap(index + 1), wrap(index - 1)])
      new Image().src = srcOf(i);
  };
  const counter = () => {
    count.textContent =
      links.length > 1 ? `${index + 1} / ${links.length}` : "";
  };
  const distance = () => (reduced ? 0 : Math.min(win.innerWidth * 0.35, 320));

  /** Slide to the photo `step` away; `fromX` continues a swipe from where the finger left it. */
  const change = (step, fromX = 0) => {
    // A new tap finishes the slide in progress at once instead of waiting.
    for (const anim of stage.getAnimations({ subtree: true })) anim.finish();
    queue = queue.then(async () => {
      index = wrap(index + step);
      counter();
      const next = await photo(index);
      const old = image;
      image = next;
      stage.append(next);
      if (!old) return;
      const dir = step > 0 ? -1 : 1;
      const d = distance();
      const out = old.animate(
        [
          {
            transform: `translateX(${fromX}px)`,
            opacity: old.style.opacity || 1,
          },
          { transform: `translateX(${dir * d}px)`, opacity: 0 },
        ],
        { duration: reduced ? 150 : 260, easing: EASE_OUT, fill: "forwards" },
      );
      const into = next.animate(
        [
          { transform: `translateX(${-dir * d}px)`, opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: reduced ? 150 : 320, easing: EASE_OUT },
      );
      await Promise.all([out.finished, into.finished]).catch(() => {});
      old.remove();
      preload();
    });
  };

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    dialog
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180,
        easing: "ease-in",
      })
      .finished.catch(() => {})
      .then(() => dialog.close());
  };
  dialog.addEventListener("close", () => dialog.remove());
  // Escape closes with the same fade.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog
    .querySelector(".gallery-lightbox-close")
    .addEventListener("click", close);
  dialog
    .querySelector(".gallery-lightbox-prev")
    .addEventListener("click", () => change(-1));
  dialog
    .querySelector(".gallery-lightbox-next")
    .addEventListener("click", () => change(1));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") change(-1);
    if (event.key === "ArrowRight") change(1);
  });

  // Swipe: the photo follows the finger, then slides on or springs back.
  let startX = null;
  let dragX = 0;
  let downOnBackdrop = false;
  dialog.addEventListener("pointerdown", (event) => {
    downOnBackdrop = event.target === dialog || event.target === stage;
    if (event.target.closest("button") || links.length < 2) return;
    startX = event.clientX;
    dragX = 0;
  });
  dialog.addEventListener("pointermove", (event) => {
    if (startX === null || !image) return;
    dragX = event.clientX - startX;
    image.style.transform = `translateX(${dragX}px)`;
    image.style.opacity = String(1 - Math.min(Math.abs(dragX) / 600, 0.4));
  });
  const release = (event) => {
    if (startX === null) return;
    const dx = dragX;
    startX = null;
    dragX = 0;
    if (Math.abs(dx) > 50) {
      change(dx < 0 ? 1 : -1, dx);
    } else if (image && dx) {
      const img = image;
      img
        .animate(
          [
            { transform: `translateX(${dx}px)`, opacity: img.style.opacity },
            { transform: "translateX(0)", opacity: 1 },
          ],
          { duration: 220, easing: EASE_OUT },
        )
        .finished.catch(() => {});
    }
    if (image) {
      image.style.transform = "";
      image.style.opacity = "";
    }
    // A tap on the backdrop (not the photo or a button) closes it; a swipe doesn't.
    const onBackdrop = event.target === dialog || event.target === stage;
    if (event.type === "pointerup" && !dx && downOnBackdrop && onBackdrop)
      close();
  };
  dialog.addEventListener("pointerup", release);
  dialog.addEventListener("pointercancel", release);

  if (links.length < 2) {
    dialog.querySelector(".gallery-lightbox-prev").hidden = true;
    dialog.querySelector(".gallery-lightbox-next").hidden = true;
  }
  doc.body.append(dialog);
  counter();
  dialog.showModal();
  dialog.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 200,
    easing: "ease-out",
  });
  photo(index).then((img) => {
    if (image) return; // already moved on
    image = img;
    stage.append(img);
    img.animate(
      [
        { transform: reduced ? "none" : "scale(0.96)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 260, easing: EASE_OUT },
    );
    preload();
  });
}
