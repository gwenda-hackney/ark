/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fadeOutElement,
  revealEnterScene,
  shouldSkipEntranceMotion,
} from "./entrance-motion.js";

describe("entrance-motion", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("navigation-restore", "fonts-ready");
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("skips motion when navigation-restore is set", () => {
    document.documentElement.classList.add("navigation-restore");
    expect(shouldSkipEntranceMotion()).toBe(true);
  });

  it("reveals a scene after fonts-ready and image decode", async () => {
    document.body.innerHTML = `
      <div id="scene" class="enter-scene" hidden>
        <img src="/logo.webp" alt="" />
      </div>
    `;
    const scene = document.getElementById("scene");
    const img = scene.querySelector("img");
    Object.defineProperty(img, "complete", { value: true, configurable: true });
    img.decode = vi.fn().mockResolvedValue(undefined);

    document.documentElement.classList.add("fonts-ready");
    await revealEnterScene(scene, { unhide: true });

    expect(scene.hidden).toBe(false);
    expect(scene.classList.contains("is-visible")).toBe(true);
    expect(img.decode).toHaveBeenCalled();
  });

  it("fades out an element before hiding it", async () => {
    document.body.innerHTML = `<div id="loader">Loading</div>`;
    const loader = document.getElementById("loader");

    const done = fadeOutElement(loader);
    expect(loader.classList.contains("is-leaving")).toBe(true);

    loader.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "opacity" }));
    await done;

    expect(loader.hidden).toBe(true);
    expect(loader.classList.contains("is-leaving")).toBe(false);
  });
});
