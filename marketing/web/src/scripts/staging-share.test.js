/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { initStagingShare } from "./staging-share.js";

function ribbon() {
  document.body.innerHTML = `
    <button type="button" id="staging-share">
      <span data-staging-share-label>Staging</span>
    </button>
  `;
  return document.getElementById("staging-share");
}

describe("staging share after view transitions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies a share link from a button added after the first page", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://staging.example/?unlock=1" }),
      }),
    );

    initStagingShare();
    document.body.innerHTML = "";
    const button = ribbon();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://staging.example/?unlock=1",
      );
    });
    expect(button.querySelector("[data-staging-share-label]").textContent).toBe(
      "Copied",
    );
  });
});
