import bottleImg from "../assets/images/logos/bottle.png";
import roomImg from "../assets/images/hero/hero.png";
import burgerImg from "../assets/images/food/chez-pickle-burger.jpg";
import chezPickleImg from "../assets/images/food/chez-pickle.png";
import turntableImg from "../assets/images/play/turn-table.jpg";
import drinksImg from "../assets/images/gallery/margarita-on-the-bar.webp";

/** The logo, large, over the hero: max rendered width is 27rem (432px). */
export const chartHeroLogo = {
  src: bottleImg,
  width: 432,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The logo at the top of the menu panel: 9rem (144px). */
export const chartFlag = {
  src: bottleImg,
  width: 144,
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

/** The decks, wide, in home's play row: up to 36rem (576px). */
export const homeDecksPhoto = {
  src: turntableImg,
  width: 576,
  format: "webp" as const,
  densities: [1, 2] as const,
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

/** The same photo, small, in Contact's party part: up to 20rem. */
export const contactDrinksPhoto = {
  src: drinksImg,
  width: 400,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** The guest chef's own mark, on home's food side: 7rem (112px). */
export const guestChefLogo = {
  src: chezPickleImg,
  width: 112,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** Home's food side: a burger from the guest chef. The photo is only 240px wide. */
export const homeFoodPhoto = {
  src: burgerImg,
  width: 240,
  format: "webp" as const,
};
