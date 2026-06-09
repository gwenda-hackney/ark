import { siteConfig } from "./site";
import { openingDateLabel } from "./opening";
import type { SiteMode } from "../types/features";

function storyClosingWithDate(closing: string): string {
  return `${closing} The door opens ${openingDateLabel()}.`;
}

export function getCopy(mode: SiteMode) {
  const { copy } = siteConfig;

  if (mode === "preview") {
    return {
      description: siteConfig.description,
      storyBody: copy.storyBody,
      storyClosing: storyClosingWithDate(copy.storyClosing),
      signupEyebrow: "Pre-launch",
      signupHeading: copy.signupHeading,
      signupSubheading: copy.signupSubheading,
      footerOpening: null as string | null,
    };
  }

  return {
    description: copy.descriptionPromo,
    storyBody: copy.storyBodyPromo,
    storyClosing: storyClosingWithDate(copy.storyClosingPromo),
    signupEyebrow: copy.signupEyebrowPromo,
    signupHeading: copy.signupHeading,
    signupSubheading: copy.signupSubheadingPromo,
    footerOpening: copy.footerOpeningPromo,
  };
}
