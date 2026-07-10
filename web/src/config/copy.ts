import { siteConfig } from "./site";
import type { SiteMode } from "../types/features";

export function getCopy(mode: SiteMode) {
  const { copy } = siteConfig;

  if (mode === "preview") {
    return {
      description: siteConfig.description,
      storyBody: copy.storyBody,
      storyClosing: copy.storyClosing,
      storyOpening: null as string | null,
      signupEyebrow: "Pre-launch",
      signupHeading: copy.signupHeading,
      signupSubheading: copy.signupSubheading,
      footerOpening: null as string | null,
    };
  }

  return {
    description: copy.descriptionPromo,
    storyBody: copy.storyBodyPromo,
    storyClosing: copy.storyClosingPromo,
    storyOpening: null as string | null,
    signupEyebrow: copy.signupEyebrowPromo,
    signupHeading: copy.signupHeading,
    signupSubheading: copy.signupSubheadingPromo,
    footerOpening: null as string | null,
  };
}
