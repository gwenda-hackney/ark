/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  restartEnterStaggerAuto,
  whenViewTransitionSettled,
} from "./hero-reveal.js";
import {
  initNavigationRestore,
  settleAnimations,
} from "./navigation-restore.js";

describe("hero reveal after view transitions", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    Object.defineProperty(document, "fonts", {
      value: { status: "loaded", ready: Promise.resolve() },
      configurable: true,
    });
    document.body.innerHTML = `
      <img class="hero-logo enter-stagger enter-stagger--auto" alt="Gwenda" />
      <p class="hero-location enter-stagger enter-stagger--auto">Hackney Wick</p>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    vi.unstubAllGlobals();
  });

  it("forces stagger visible when navigation-restore is set", () => {
    document.documentElement.classList.add("fonts-ready", "navigation-restore");
    const logo = document.querySelector(".hero-logo");
    logo.style.opacity = "0";

    restartEnterStaggerAuto();

    expect(logo.style.opacity).toBe("1");
  });

  it("restarts stagger animation when fonts are already ready", () => {
    document.documentElement.classList.add("fonts-ready");
    const logo = document.querySelector(".hero-logo");

    restartEnterStaggerAuto();

    // After restart, inline animation override is cleared so CSS can run.
    expect(logo.style.animation).toBe("");
  });

  it("restores fonts-ready and shows logo after a class wipe", () => {
    // Simulate Astro swapRootAttributes wiping client classes.
    document.documentElement.className = "fonts-ready";
    document.documentElement.className = "";
    const logo = document.querySelector(".hero-logo");
    logo.style.opacity = "0";

    restartEnterStaggerAuto();

    expect(document.documentElement.classList.contains("fonts-ready")).toBe(
      true,
    );
    // Either CSS animation restarted, or force-visible fallback applied.
    // With fonts-ready restored from document.fonts.status === loaded, restart runs.
    expect(logo.style.animation).toBe("");
  });

  it("resolves after two frames when no view-transition animations are running", async () => {
    document.getAnimations = vi.fn(() => []);
    await expect(whenViewTransitionSettled()).resolves.toBeUndefined();
  });
});

describe("navigation restore under Astro traverse", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    Object.defineProperty(document, "fonts", {
      value: { status: "loaded", ready: Promise.resolve() },
      configurable: true,
    });
    document.body.innerHTML = `
      <img class="hero-logo enter-stagger enter-stagger--auto" alt="" />
      <div class="hero-media"><img class="hero-image" alt="" /></div>
    `;
    vi.stubGlobal("performance", {
      getEntriesByType: vi.fn(() => [{ type: "navigate" }]),
    });
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    initNavigationRestore();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    vi.unstubAllGlobals();
  });

  it("re-applies restore after swap wipes html classes", () => {
    const prep = new Event("astro:before-preparation");
    Object.defineProperty(prep, "navigationType", { value: "traverse" });
    document.dispatchEvent(prep);

    // Simulate Astro swapRootAttributes wiping client classes.
    document.documentElement.className = "";

    document.dispatchEvent(new Event("astro:after-swap"));

    expect(
      document.documentElement.classList.contains("navigation-restore"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("fonts-ready")).toBe(
      true,
    );

    const logo = document.querySelector(".hero-logo");
    expect(logo.style.opacity).toBe("1");
    expect(
      document.querySelector(".hero-image")?.classList.contains("is-visible"),
    ).toBe(true);
  });

  it("clears restore mode on forward soft navigations", () => {
    document.documentElement.classList.add("navigation-restore");
    const prep = new Event("astro:before-preparation");
    Object.defineProperty(prep, "navigationType", { value: "push" });
    document.dispatchEvent(prep);

    expect(
      document.documentElement.classList.contains("navigation-restore"),
    ).toBe(false);
  });

  it("settleAnimations makes enter-stagger opaque", () => {
    const logo = document.querySelector(".hero-logo");
    logo.style.opacity = "0";
    settleAnimations();
    expect(logo.style.opacity).toBe("1");
  });
});
