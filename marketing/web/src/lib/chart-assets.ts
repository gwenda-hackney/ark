import bottleImg from "../assets/images/logos/bottle.png";
import roomImg from "../assets/images/hero/hero.png";
import turntableImg from "../assets/images/play/turn-table.jpg";
import drinksImg from "../assets/images/gallery/margarita-on-the-bar.webp";
import heroLogo320 from "../assets/images/logos/bottle-hero-320.webp";
import heroLogo432 from "../assets/images/logos/bottle-hero-432.webp";
import heroLogo640 from "../assets/images/logos/bottle-hero-640.webp";
import heroLogo864 from "../assets/images/logos/bottle-hero-864.webp";

const heroLogoFiles = [heroLogo320, heroLogo432, heroLogo640, heroLogo864];

/**
 * The logo, large, over the hero: home's first sight, and the page's largest
 * paint. It is 82vw on a phone and at most 27rem (432px), from 33rem up
 * (styles/chart.css, --ch-hero-logo), so a phone fetches a phone's file.
 * The files are 16-colour lossless WebP from scripts/write-hero-logo.mjs,
 * used as they are (a third of astro:assets' lossy WebP): attributes for a
 * plain <img>. No <link rel="preload"> for it: the <img> is near the top of
 * the page and the browser already asks for it with the stylesheets; a
 * preload measured no sooner.
 */
export const chartHeroLogo = {
  src: heroLogo432.src,
  srcset: heroLogoFiles.map((file) => `${file.src} ${file.width}w`).join(", "),
  sizes: "(min-width: 33rem) 27rem, 82vw",
  width: heroLogo432.width,
  height: heroLogo432.height,
};

/** The logo at the top of the menu panel: 9rem (144px). */
export const chartFlag = {
  src: bottleImg,
  width: 144,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The logo at the left of the bar on a desk screen: 3.25rem (52px). */
export const chartBarLogo = {
  src: bottleImg,
  width: 52,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The room behind the hero, full bleed. */
export const chartHeroBackground = {
  src: roomImg,
  width: 1600,
  format: "webp" as const,
  quality: 72,
};

/**
 * The decks at the top of the play form: half the page on a desk (about 30rem),
 * the full width on a phone. The source is 1321px wide, enough for both at 2x.
 */
export const playDecksPhoto = {
  src: turntableImg,
  widths: [480, 720, 960, 1320],
  sizes: "(min-width: 56rem) 30rem, calc(100vw - 2.5rem)",
  format: "webp" as const,
};

/**
 * Drinks on the bar, at the top of the party form: the same slot as the
 * decks on the play form. The source is 1130px wide and 4:5.
 */
export const partyDrinksPhoto = {
  src: drinksImg,
  widths: [480, 720, 960, 1130],
  sizes: "(min-width: 56rem) 30rem, calc(100vw - 2.5rem)",
  format: "webp" as const,
};
