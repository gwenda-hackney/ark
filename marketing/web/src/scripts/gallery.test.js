// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { initGallery, layout, planMasonry } from "./gallery.js";

// jsdom has no dialogs, animations or image decoding: just enough to drive it.
beforeAll(() => {
  const done = () => ({ finished: Promise.resolve(), finish() {} });
  Element.prototype.animate = done;
  Element.prototype.getAnimations = () => [];
  HTMLImageElement.prototype.decode = () => Promise.resolve();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function gallery(n) {
  document.body.innerHTML = `<ul class="series-gallery-list">${Array.from(
    { length: n },
    (_, i) =>
      `<li class="series-gallery-item"><a href="https://cdn.example/${i}.jpg" data-full="https://cdn.example/${i}.jpg?w=1800"><img alt="photo ${i + 1}" /></a></li>`,
  ).join("")}</ul>`;
  initGallery(document);
}

const shown = () =>
  [...document.querySelectorAll(".gallery-lightbox-image")].map((img) =>
    img.getAttribute("alt"),
  );
const count = () =>
  document.querySelector(".gallery-lightbox-count").textContent;

describe("lightbox", () => {
  it("opens the tapped photo, slides through, wraps, and closes", async () => {
    gallery(3);
    document.querySelectorAll(".series-gallery-item a")[1].click();
    await tick();
    expect(shown()).toEqual(["photo 2"]);
    expect(count()).toBe("2 / 3");

    document.querySelector(".gallery-lightbox-next").click();
    await tick();
    await tick();
    expect(shown()).toEqual(["photo 3"]);
    expect(count()).toBe("3 / 3");

    document.querySelector(".gallery-lightbox-next").click();
    await tick();
    await tick();
    expect(shown()).toEqual(["photo 1"]);

    document.querySelector(".gallery-lightbox-close").click();
    await tick();
    expect(document.querySelector(".gallery-lightbox")).toBe(null);
  });
});

describe("masonry", () => {
  const bottoms = (plan) => {
    const ends = new Map();
    for (const p of plan.places) {
      ends.set(p.x, Math.max(ends.get(p.x) || 0, p.y + p.h));
    }
    return [...ends.values()];
  };

  it("ends level: the screenshot's five go in two even columns on a wide screen", () => {
    const plan = planMasonry([1.33, 0.8, 0.8, 1.25, 1], 1000);
    const ends = bottoms(plan);
    expect(ends).toHaveLength(2);
    expect(Math.max(...ends) - Math.min(...ends)).toBeLessThan(24);
  });

  it("uses three columns when they come out level", () => {
    const plan = planMasonry(new Array(9).fill(1), 1000);
    expect(bottoms(plan)).toHaveLength(3);
  });

  it("never grows a photo more than 15%; leaves a small edge instead", () => {
    const plan = planMasonry([0.5, 3], 408); // one tall, one very wide
    const [tall, wide] = plan.places;
    expect(tall.h).toBeCloseTo(400);
    expect(wide.h).toBeCloseTo((200 / 3) * 1.15);
  });

  it("keeps newest first in reading order for a long gallery", () => {
    const plan = planMasonry(new Array(20).fill(1), 408);
    // Squares alternate left, right while the greedy part places them.
    expect(plan.places.slice(0, 4).map((p) => p.x)).toEqual([0, 208, 0, 208]);
  });

  it("lays the photos out in the page", () => {
    document.body.innerHTML = `<ul class="series-gallery-list">
      <li class="series-gallery-item" style="--ratio: 1"></li>
      <li class="series-gallery-item" style="--ratio: 1"></li>
    </ul>`;
    const list = document.querySelector("ul");
    Object.defineProperty(list, "clientWidth", { value: 408 });
    layout(list);
    expect([...list.children].map((item) => item.style.transform)).toEqual([
      "translate(0px, 0px)",
      "translate(208px, 0px)",
    ]);
    expect(list.style.height).toBe("200px");
  });
});

describe("reveal on scroll", () => {
  it("keeps each photo hidden until it scrolls into view, then shows it", async () => {
    const observers = [];
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        observers.push(this);
      }
      observe(target) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    };
    document.body.innerHTML = `<ul class="series-gallery-list">
      <li class="series-gallery-item" style="--ratio: 1"><a href="/a.jpg"><img alt="" /></a></li>
    </ul>`;
    const { revealOnScroll } = await import("./gallery.js");
    const item = document.querySelector("li");
    revealOnScroll(window, [item]);
    const link = item.querySelector("a");
    expect(link.style.opacity).toBe("0");
    const io = observers.at(-1);
    io.callback(io.targets.map((target) => ({ target, isIntersecting: true })));
    expect(link.style.opacity).toBe("");
  });
});
