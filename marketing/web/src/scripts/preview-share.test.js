/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { initPreviewShare } from "./preview-share.js";

function ribbon() {
  document.body.innerHTML = `
    <button type="button" id="preview-share">
      <span data-preview-share-label>Preview</span>
    </button>
  `;
  return document.getElementById("preview-share");
}

describe("preview share after view transitions", () => {
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
        json: async () => ({ url: "https://preview.example/?unlock=1" }),
      }),
    );

    initPreviewShare();
    document.body.innerHTML = "";
    const button = ribbon();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "https://preview.example/?unlock=1",
      );
    });
    expect(button.querySelector("[data-preview-share-label]").textContent).toBe(
      "Copied",
    );
  });
});
