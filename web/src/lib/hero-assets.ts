import type { ImageMetadata } from "astro";
import heroImg from "../assets/images/hero/hero.png";
import logo from "../assets/images/logos/logo.png";

/** Blurred full-bleed background — 1024px is plenty at typical viewports. */
export const heroBackground = {
  src: heroImg,
  width: 1024,
  format: "webp" as const,
  quality: 80,
};

/** Hero logo: max rendered height is 200px (see .hero-logo). */
export const heroLogo = {
  src: logo,
  height: 200,
  format: "webp" as const,
};

/** Header + signup confirm: 80px / 88px max rendered height. */
export const headerLogo = {
  src: logo,
  height: 80,
  format: "webp" as const,
  densities: [1, 2] as const,
};

/** Gate + thanks pages: clamp max is 7rem (~112px). */
export const compactLogo = {
  src: logo,
  height: 112,
  format: "webp" as const,
  densities: [1, 2] as const,
};

export { heroImg, logo };
export type { ImageMetadata };
