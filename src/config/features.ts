import { siteConfig } from "./site";
import type { SiteFeatures, SiteMode } from "../types/features";

const previewFeatures: SiteFeatures = {
  showMenu: true,
  showGallery: true,
  showPrices: true,
  revealDrinkNames: true,
  showTeam: true,
  showMenuTease: false,
  showAtmosphere: false,
  showSocial: true,
  showOpeningDate: true,
  useShortAddress: false,
};

const promoFeatures: SiteFeatures = {
  ...siteConfig.features,
  showTeam: true,
  showMenuTease: true,
  showAtmosphere: false,
  showSocial: true,
  showOpeningDate: false,
  useShortAddress: true,
};

export function getFeatures(mode: SiteMode): SiteFeatures {
  if (mode === "preview") return previewFeatures;
  return promoFeatures;
}
