import bottleImg from "../assets/images/logos/bottle.png";
import tavernImg from "../assets/images/hero/tavern.webp";
import turntableImg from "../assets/images/play/turn-table.jpg";

/** The spilt bottle, large, over the hero: max rendered width is 22rem (352px). */
export const chartHeroLogo = {
  src: bottleImg,
  width: 352,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The mark at the top of the chart: 5.5rem (88px). */
export const chartFlag = {
  src: bottleImg,
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

/** The turntable from the play form: beside the form, and in home's play row. Up to 28rem (448px). */
export const chartTurntableLarge = {
  src: turntableImg,
  width: 448,
  format: "webp" as const,
  densities: [1, 2] as const,
};
