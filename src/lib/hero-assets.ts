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

/** Hero logo: max rendered height is 240px (see .hero-logo). */
export const heroLogo = {
  src: logo,
  height: 240,
  format: "webp" as const,
};

export { heroImg, logo };
export type { ImageMetadata };
