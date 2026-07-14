/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeInviteCard,
  fadeOutRsvpLoading,
  initInviteCard,
  openInviteCard,
  resetInviteCardMotionForTests,
  showInviteCard,
  syncInviteCardHeight,
} from "./invite-card.js";

function mountInviteCard() {
  document.body.innerHTML = `
    <div id="invite-card-scene">
      <div class="invite-card" id="invite-card">
        <div class="invite-card-inner">
          <button type="button" class="invite-card-front" id="invite-card-open" aria-expanded="false">
            <div class="invite-card-front-idle" id="invite-card-front-idle">
              <span class="invite-card-hint">Tap anywhere to open</span>
            </div>
            <div class="invite-card-front-sending" id="invite-card-front-sending" hidden>
              <p class="invite-card-sending-text">Sending your reply</p>
            </div>
          </button>
          <div class="invite-card-back" id="invite-card-back">
            <div class="invite-card-back-inner" id="invite-card-back-inner"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

describe("invite-card history", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    mountInviteCard();
    window.history.replaceState(null, "", "/events/launch-party?event-password=ember-harbor-lantern");
    initInviteCard();
  });

  afterEach(() => {
    resetInviteCardMotionForTests();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("pushes history when the card opens", () => {
    const pushState = vi.spyOn(window.history, "pushState");

    openInviteCard();

    expect(document.getElementById("invite-card")?.classList.contains("is-open")).toBe(true);
    expect(pushState).toHaveBeenCalledWith(
      { inviteCard: "open" },
      "",
      window.location.href,
    );
  });

  it("closes the card when the user goes back", () => {
    openInviteCard({ pushHistory: true });

    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    expect(document.getElementById("invite-card")?.classList.contains("is-open")).toBe(false);
    expect(document.getElementById("invite-card-front-idle")?.hidden).toBe(true);
  });

  it("shows the front cover only after the close flip finishes", () => {
    openInviteCard({ pushHistory: true });
    const card = document.getElementById("invite-card");
    const inner = document.querySelector("#invite-card .invite-card-inner");
    const idle = document.getElementById("invite-card-front-idle");

    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));

    expect(card?.classList.contains("is-flipping")).toBe(true);
    expect(idle?.hidden).toBe(true);

    inner?.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "transform" }));

    expect(card?.classList.contains("is-flipping")).toBe(false);
    expect(idle?.hidden).toBe(false);
  });

  it("does not push duplicate history entries while open", () => {
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(
      (state, unused, url) => {
        History.prototype.pushState.call(window.history, state, unused, url);
      },
    );

    openInviteCard();
    openInviteCard();

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("reopens the card when navigating forward to the open state", () => {
    openInviteCard({ pushHistory: true });
    closeInviteCard();

    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { inviteCard: "open" } }),
    );

    expect(document.getElementById("invite-card")?.classList.contains("is-open")).toBe(true);
  });

  it("clears inline height when the card is closed", () => {
    const inner = document.querySelector("#invite-card .invite-card-inner");
    openInviteCard({ pushHistory: false });
    closeInviteCard();
    syncInviteCardHeight();
    expect(inner?.style.height).toBe("");
  });

  it("sets inner height to back content when open", () => {
    const inner = document.querySelector("#invite-card .invite-card-inner");
    const backInner = document.getElementById("invite-card-back-inner");
    Object.defineProperty(backInner, "scrollHeight", {
      value: 480,
      configurable: true,
    });

    openInviteCard({ pushHistory: false });
    syncInviteCardHeight();

    expect(inner?.style.height).toBe("481px");
  });

  it("reveals the card scene after showInviteCard", async () => {
    document.documentElement.classList.add("fonts-ready");
    const scene = document.getElementById("invite-card-scene");
    scene.hidden = true;
    scene.classList.remove("is-visible");

    await showInviteCard();

    expect(scene.hidden).toBe(false);
    expect(scene.classList.contains("is-visible")).toBe(true);
  });

  it("fades out the loading state before continuing", async () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div id="rsvp-loading" class="rsvp-state"><p>Opening</p></div>`,
    );
    const loading = document.getElementById("rsvp-loading");
    const onComplete = vi.fn();

    fadeOutRsvpLoading(onComplete);

    expect(loading?.classList.contains("is-leaving")).toBe(true);
    loading?.dispatchEvent(new TransitionEvent("transitionend", { propertyName: "opacity" }));
    await Promise.resolve();
    expect(loading?.hidden).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
