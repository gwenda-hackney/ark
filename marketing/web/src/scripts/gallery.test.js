// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { initGallery } from "./gallery.js";

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
