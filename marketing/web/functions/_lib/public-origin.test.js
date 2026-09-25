import { describe, expect, it } from "vitest";
import { resolvePublicOrigin } from "./public-origin.js";

describe("resolvePublicOrigin", () => {
  it("uses configured origin when request is localhost", () => {
    expect(
      resolvePublicOrigin("http://localhost:4321", {
        INVITE_BASE_URL: "https://gwenda.co.uk",
      }),
    ).toBe("https://gwenda.co.uk");
  });

  it("keeps a public request origin", () => {
    expect(resolvePublicOrigin("https://preview.gwenda-blue.pages.dev", {})).toBe(
      "https://preview.gwenda-blue.pages.dev",
    );
  });
});
