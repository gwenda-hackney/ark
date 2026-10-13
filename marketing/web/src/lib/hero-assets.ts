import type { ImageMetadata } from "astro";
import heroImg from "../assets/images/hero/tavern.webp";
import logo from "../assets/images/logos/logo.png";
import bottleLogo from "../assets/images/logos/bottle.png";

/** The tavern, lantern-lit, full bleed and sharp: 1600px wide. */
export const heroBackground = {
  src: heroImg,
  width: 1600,
  format: "webp" as const,
  quality: 72,
};

/** Hero logo, the bottle over the record: max rendered height is 440px (see .hero-logo). */
export const heroLogo = {
  src: bottleLogo,
  height: 440,
  format: "webp" as const,
  densities: [1, 2] as const,
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

/** Invite card front: clamp max is 8.5rem (~136px), gate/hero scale. */
export const inviteCardLogo = {
  src: logo,
  height: 200,
  format: "webp" as const,
  densities: [1, 2] as const,
};

export { heroImg, logo };
export type { ImageMetadata };
