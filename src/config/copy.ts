import { siteConfig } from "./site";
import type { SiteMode } from "../types/features";
import { openingPromoLine } from "./opening";

export function getCopy(mode: SiteMode) {
  const { copy } = siteConfig;
  const storyOpening = openingPromoLine();

  if (mode === "preview") {
    return {
      description: siteConfig.description,
      storyBody: copy.storyBody,
      storyClosing: copy.storyClosing,
      storyOpening,
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
    storyOpening,
    signupEyebrow: copy.signupEyebrowPromo,
    signupHeading: copy.signupHeading,
    signupSubheading: copy.signupSubheadingPromo,
    footerOpening: openingPromoLine(),
  };
}
