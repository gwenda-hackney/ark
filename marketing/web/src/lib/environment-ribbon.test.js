import { describe, expect, it } from "vitest";
import { RIBBON_MAX_CHARS, environmentRibbon } from "./environment-ribbon.js";

describe("environmentRibbon", () => {
  it("never shows on a production build", () => {
    expect(environmentRibbon({ dev: false, isPreview: false })).toBeNull();
    expect(environmentRibbon()).toBeNull();
  });

  it("never shows on a production build, even with a label set", () => {
    expect(
      environmentRibbon({
        dev: false,
        isPreview: false,
        envLabel: "Dev",
        sanityPerspective: "published",
      }),
    ).toBeNull();
  });

  it("says Local on a local dev server", () => {
    expect(environmentRibbon({ dev: true })).toEqual({
      label: "Local",
      text: "Local",
    });
    expect(
      environmentRibbon({ dev: true, sanityPerspective: "previewDrafts" }),
    ).toEqual({ label: "Local", text: "Local" });
  });

  it("says Local · live under web:dev:live (published content)", () => {
    expect(
      environmentRibbon({ dev: true, sanityPerspective: "published" }),
    ).toEqual({ label: "Local · live", text: "Local · live" });
  });

  it("says Local even if a hosted label leaked into the local env", () => {
    expect(
      environmentRibbon({ dev: true, isPreview: true, envLabel: "Dev" }),
    ).toEqual({ label: "Local", text: "Local" });
  });

  it("uses the hosted label on the dev website and its preview", () => {
    expect(environmentRibbon({ isPreview: true, envLabel: "Dev" })).toEqual({
      label: "Dev",
      text: "Dev",
    });
    expect(
      environmentRibbon({ isPreview: true, envLabel: "Dev · preview" }),
    ).toEqual({ label: "Dev · preview", text: "Dev · preview" });
  });

  it("says Preview on prod's preview, which sets no label", () => {
    expect(environmentRibbon({ isPreview: true, envLabel: "" })).toEqual({
      label: "Preview",
      text: "Preview",
    });
  });

  it("keeps a branch build's first word on the ribbon, the rest in the label", () => {
    const ribbon = environmentRibbon({
      isPreview: true,
      envLabel: "Dev · feat-240-social-home",
    });
    expect(ribbon).toEqual({
      label: "Dev · feat-240-social-home",
      text: "Dev",
    });
  });

  it("fits every label it can show on the ribbon", () => {
    for (const env of [
      { dev: true },
      { dev: true, sanityPerspective: "published" },
      { isPreview: true, envLabel: "Dev" },
      { isPreview: true, envLabel: "Dev · preview" },
      { isPreview: true, envLabel: "Dev · feat-240-social-home" },
      { isPreview: true },
    ]) {
      expect(environmentRibbon(env)?.text.length).toBeLessThanOrEqual(
        RIBBON_MAX_CHARS,
      );
    }
  });
});
