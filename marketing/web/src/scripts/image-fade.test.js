// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fadeInEventPhotos } from "./image-fade.js";

describe("fadeInEventPhotos", () => {
  it("shows the blurred copy until the photo loads", () => {
    document.body.innerHTML = `<figure class="event-media"><img class="event-hero" src="https://cdn.sanity.io/x.jpg" /></figure>`;
    const media = document.querySelector(".event-media");
    fadeInEventPhotos(document);
    expect(media.classList.contains("is-loading")).toBe(true);
    document.querySelector("img").dispatchEvent(new Event("load"));
    expect(media.classList.contains("is-loading")).toBe(false);
  });
});
