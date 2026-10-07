import flagImg from "../assets/images/logos/flag.png";
import tavernImg from "../assets/images/hero/tavern.webp";

/** The torn flag, large, over the hero: max rendered width is 18rem (288px). */
export const chartHeroLogo = {
  src: flagImg,
  width: 288,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The flag at the top of the chart: 5.5rem (88px). */
export const chartFlag = {
  src: flagImg,
  width: 88,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The flag on the button that opens the chart: 2.75rem (44px). */
export const chartButtonLogo = {
  src: flagImg,
  width: 44,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The room behind the hero, full bleed. */
export const chartHeroBackground = {
  src: tavernImg,
  width: 1600,
  format: "webp" as const,
  quality: 72,
};
