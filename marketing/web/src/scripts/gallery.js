/**
 * Event galleries (#30): "Show all" reveals the photos past the first rows,
 * and a tapped photo opens large, with arrows, swipe and Escape. Listens on
 * the document, so it works on series and night pages, rendered on request.
 *
 * The gallery is masonry: each photo goes in the shortest column, so the
 * order reads across. Each photo comes into focus as it scrolls into view
 * (from soft and faint to sharp), and photos glide (a CSS transition) when the
 * columns change. Reduced motion
 * turns the movement off. Without this script, CSS columns show the photos.
 */
let installed = false;

export function initGallery(doc = document) {
  if (installed) return;
  installed = true;
  arrangeLists(doc);
  doc.addEventListener("astro:page-load", () => arrangeLists(doc));
  doc.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const more = target?.closest("[data-gallery-more]");
    if (more) {
      const list = more
        .closest(".series-gallery")
        ?.querySelector(".series-gallery-list");
      const revealed = [
        ...(list?.querySelectorAll(".series-gallery-item[hidden]") || []),
      ];
      for (const item of revealed) item.hidden = false;
      more.remove();
      if (list?.classList.contains("is-masonry")) layout(list);
      // The new photos rise in; the rest glide if their rows changed.
      if (list && !reducedMotion(doc)) {
        revealOnScroll(doc.defaultView || window, revealed);
      }
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

const reducedMotion = (doc) =>
  Boolean(
    (doc.defaultView || window).matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches,
  );

const arranged = new WeakSet();
const GAP_PX = 8;

const items = (list) => [
  ...list.querySelectorAll(".series-gallery-item:not([hidden])"),
];

function ratioOf(item) {
  return parseFloat(item.style.getPropertyValue("--ratio")) || 1;
}

/** At most this much taller (trimmed at the edges) to level the columns. */
const MAX_STRETCH = 0.15;

/** Digit `place` of `code` in base `base`. */
const digit = (code, place, base) => Math.floor(code / base ** place) % base;

/** Columns no more uneven than this count as level. */
const LEVEL_PX = 24;

/** Column bottoms once each short column's photos grow (up to MAX_STRETCH). */
function levelled(sums, gaps) {
  const tallest = Math.max(...sums.map((sum, c) => sum + gaps[c]));
  const grow = sums.map((sum, c) =>
    sum ? Math.min(1 + (tallest - sum - gaps[c]) / sum, 1 + MAX_STRETCH) : 1,
  );
  const ends = sums.map((sum, c) => sum * grow[c] + gaps[c]);
  return { grow, uneven: Math.max(...ends) - Math.min(...ends) };
}

/** One layout with `cols` columns; `uneven` is how far the bottoms still differ. */
function planColumns(ratios, listWidth, cols) {
  const width = (listWidth - GAP_PX * (cols - 1)) / cols;
  const natural = ratios.map((ratio) => width / (ratio || 1));
  const col = new Array(natural.length);
  const heights = new Array(cols).fill(0);
  const tail = Math.min(natural.length, cols * 2);
  const head = natural.length - tail;
  // Newest first, each in the shortest column...
  for (let i = 0; i < head; i++) {
    col[i] = heights.indexOf(Math.min(...heights));
    heights[col[i]] += natural[i] + GAP_PX;
  }
  // ...except the last few: every way to share them out (3^6 = 729 at most),
  // keeping the one that ends most level. The earliest photo is the
  // slowest-changing digit, so among equals the first keeps reading order.
  const sumsFor = (code) => {
    const sums = new Array(cols).fill(0);
    const gaps = new Array(cols).fill(0);
    for (let i = 0; i < natural.length; i++) {
      const c = i < head ? col[i] : digit(code, natural.length - 1 - i, cols);
      sums[c] += natural[i];
      gaps[c] += GAP_PX;
    }
    return { sums, gaps };
  };
  let best = null;
  for (let code = 0; code < cols ** tail; code++) {
    const { sums, gaps } = sumsFor(code);
    const { uneven } = levelled(sums, gaps);
    if (!best || uneven < best.uneven - 0.5) best = { code, uneven };
  }
  for (let i = head; i < natural.length; i++) {
    col[i] = digit(best.code, natural.length - 1 - i, cols);
  }
  const { sums, gaps } = sumsFor(best.code);
  const { grow, uneven } = levelled(sums, gaps);
  const y = new Array(cols).fill(0);
  const places = natural.map((h, i) => {
    const c = col[i];
    const place = { x: c * (width + GAP_PX), y: y[c], h: h * grow[c] };
    y[c] += place.h + GAP_PX;
    return place;
  });
  return {
    width,
    height: Math.max(0, Math.max(...y) - GAP_PX),
    places,
    uneven,
  };
}

/**
 * Where each photo goes. Two columns on phones; wider, three unless that
 * leaves a gap at the bottom and two doesn't. Photos in shorter columns grow
 * a little (up to MAX_STRETCH, trimmed at the edges) so the columns end level.
 * @param {number[]} ratios width / height of each photo, newest first
 */
export function planMasonry(ratios, listWidth) {
  if (!ratios.length) return { width: 0, height: 0, places: [], uneven: 0 };
  if (listWidth < 600) return planColumns(ratios, listWidth, 2);
  const three = planColumns(ratios, listWidth, 3);
  if (three.uneven <= LEVEL_PX) return three;
  const two = planColumns(ratios, listWidth, 2);
  return two.uneven < three.uneven ? two : three;
}

export function layout(list) {
  const listWidth = list.clientWidth;
  if (!listWidth) return;
  const photos = items(list);
  const plan = planMasonry(photos.map(ratioOf), listWidth);
  photos.forEach((item, i) => {
    const { x, y, h } = plan.places[i];
    item.style.width = `${plan.width}px`;
    item.style.height = `${h}px`;
    item.style.transform = `translate(${x}px, ${y}px)`;
  });
  list.style.height = `${plan.height}px`;
}

/** Photos waiting to come into focus. */
const covered = new WeakSet();

/** Hidden until revealed (an inline style, so without the script they just show). */
function cover(item) {
  const link = item.firstElementChild;
  if (!link) return;
  link.style.opacity = "0";
  covered.add(link);
}

/**
 * Bring photos into focus: each starts soft and faint, a little low, and
 * sharpens as it settles. Photos arriving together go left to right, then
 * top to bottom.
 */
function reveal(photos) {
  const order = photos
    .map((item) => ({ item, box: item.getBoundingClientRect() }))
    .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
  order.forEach(({ item }, i) => {
    const link = item.firstElementChild;
    if (!link || !covered.has(link)) return;
    covered.delete(link);
    link.style.opacity = "";
    link.animate(
      [
        { opacity: 0, filter: "blur(8px)", transform: "translateY(0.75rem)" },
        { opacity: 1, filter: "blur(0)", transform: "none" },
      ],
      {
        duration: 900,
        delay: Math.min(i, 8) * 250,
        easing: EASE_OUT,
        fill: "backwards",
      },
    );
  });
}

/** Each photo stays covered until it scrolls into view, then is revealed. */
export function revealOnScroll(win, photos) {
  if (!win.IntersectionObserver) return;
  const seen = new win.IntersectionObserver(
    (entries) => {
      const arriving = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target);
      for (const item of arriving) seen.unobserve(item);
      if (arriving.length) reveal(arriving);
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  for (const item of photos) {
    cover(item);
    seen.observe(item);
  }
}

/** A photo not loaded yet waits invisibly over its blurred copy, then fades in. */
function fadeInWhenLoaded(list) {
  for (const img of list.querySelectorAll(".series-gallery-item img")) {
    if (img.complete && img.naturalWidth) continue;
    img.classList.add("is-loading");
    const done = () => img.classList.remove("is-loading");
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
}

function arrangeLists(doc) {
  const win = doc.defaultView || window;
  const still = reducedMotion(doc);
  for (const list of doc.querySelectorAll(".series-gallery-list")) {
    if (arranged.has(list)) continue;
    arranged.add(list);
    fadeInWhenLoaded(list);
    // First placement without gliding from the corner.
    list.classList.add("is-masonry", "is-settling");
    layout(list);
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => list.classList.remove("is-settling")),
    );
    if (win.ResizeObserver) {
      let width = list.clientWidth;
      new win.ResizeObserver(() => {
        if (list.clientWidth === width) return;
        width = list.clientWidth;
        layout(list);
      }).observe(list);
    }
    if (!still) revealOnScroll(win, items(list));
  }
}

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
