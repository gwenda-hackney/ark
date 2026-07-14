/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeInviteCard,
  initInviteCard,
  openInviteCard,
  syncInviteCardHeight,
} from "./invite-card.js";

function mountInviteCard() {
  document.body.innerHTML = `
    <div id="invite-card-scene">
      <div class="invite-card" id="invite-card">
        <div class="invite-card-inner">
          <button type="button" class="invite-card-front" id="invite-card-open" aria-expanded="false"></button>
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
    mountInviteCard();
    window.history.replaceState(null, "", "/events/launch-party?event-password=ember-harbor-lantern");
    initInviteCard();
  });

  afterEach(() => {
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
});
