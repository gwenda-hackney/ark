import flagImg from "../assets/images/logos/flag.png";
import bottleImg from "../assets/images/logos/bottle.png";
import tavernImg from "../assets/images/hero/tavern.webp";

/** The spilt bottle, large, over the hero: max rendered width is 22rem (352px). */
export const chartHeroLogo = {
  src: bottleImg,
  width: 352,
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

/** The room behind the hero, full bleed. */
export const chartHeroBackground = {
  src: tavernImg,
  width: 1600,
  format: "webp" as const,
  quality: 72,
};
