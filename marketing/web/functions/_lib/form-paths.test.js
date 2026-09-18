/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  FORM_PUBLIC_BASE,
  FORM_VERIFY_PATH,
  PLAY_FORM_SLUG,
  formPublicPath,
  formSubmittedPath,
  isReservedFormSlug,
  slugFromFormPath,
} from "./form-paths.js";

describe("form-paths", () => {
  it("builds public contact paths", () => {
    expect(formPublicPath("play")).toBe("/contact/play");
    expect(formSubmittedPath("play")).toBe("/contact/play/submitted");
    expect(FORM_PUBLIC_BASE).toBe("/contact");
    expect(FORM_VERIFY_PATH).toBe("/contact/verify");
    expect(PLAY_FORM_SLUG).toBe("play");
  });

  it("reserves verify", () => {
    expect(isReservedFormSlug("verify")).toBe(true);
    expect(formPublicPath("verify")).toBe("/contact");
  });

  it("parses contact and legacy forms paths", () => {
    expect(slugFromFormPath("/contact/play")).toBe("play");
    expect(slugFromFormPath("/forms/play-at-gwenda/submitted")).toBe(
      "play-at-gwenda",
    );
  });
});
