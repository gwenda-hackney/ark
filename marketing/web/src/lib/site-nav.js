import { diaryGroups } from "./diary-groups.js";

const homeLink = { href: "/", label: "Home" };

/** Every subpage menu starts with Home. Then this page's anchors and subpages. */
export function withHome(items = []) {
  return [homeLink, ...items];
}

/**
 * Path of a nav href. In-page hashes are not routes.
 * `/menu/` and `/menu` are the same page.
 *
 * @param {string} href
 */
export function navPathname(href) {
  const value = String(href || "").trim();
  if (!value || value.startsWith("#")) return "";
  const path = value.split("#")[0].split("?")[0];
  if (!path) return "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * @param {string} href
 * @param {string} pathname
 */
export function isCurrentNavPage(href, pathname) {
  const path = navPathname(href);
  if (!path) return false;
  return path === navPathname(pathname || "/");
}

/**
 * Home's own sections. Hashes stay on this page.
 *
 * @param {{ showMenu?: boolean, showTeam?: boolean, showGallery?: boolean, signupLabel?: string }} [options]
 */
export function homeAnchorItems({
  showMenu = false,
  showTeam = false,
  showGallery = false,
  signupLabel = "Join the experience",
} = {}) {
  return [
    { href: "#hero", label: "Arrival" },
    { href: "#story", label: "Story" },
    ...(showMenu ? [{ href: "#menu", label: "What we serve" }] : []),
    { href: "#what-we-do", label: "What we do" },
    ...(showTeam ? [{ href: "#team", label: "Who we are" }] : []),
    ...(showGallery ? [{ href: "#glimpse", label: "Glimpse" }] : []),
    { href: "#list", label: signupLabel, cta: true },
  ];
}

/**
 * Routes linked from home, minus the page you are already on.
 * A child such as `/whats-on/schedule` still lists What's on.
 *
 * @param {string} [pathname]
 * @param {{ showMenu?: boolean }} [options]
 */
export function sitePageLinks(pathname = "/", { showMenu = true } = {}) {
  const current = navPathname(pathname || "/");
  return [
    ...(showMenu ? [{ href: "/menu", label: "Menu" }] : []),
    { href: "/whats-on", label: "What's on" },
    { href: "/artists/current", label: "Featured artist" },
    { href: "/contact", label: "Contact" },
  ].filter((item) => navPathname(item.href) !== current);
}

/**
 * A hash on another page makes Astro's view transition swap, then jump back.
 * Those links should load normally. A hash on this page can stay in the router.
 */
export function shouldReloadNavLink(href) {
  const value = String(href || "");
  return value.includes("#") && !value.startsWith("#");
}

/** Section anchors exist only when both groups are on the diary. */
export function diarySectionFlags(nights) {
  const list = Array.isArray(nights) ? nights : [];
  const regular = list.some((event) => event?.schedule !== "once");
  const special = list.some((event) => event?.schedule === "once");
  return {
    showRegular: regular && special,
    showSpecial: special,
  };
}

/**
 * What's on: anchors on this page, then the schedule subpage.
 * The schedule does not repeat this menu, and it does not list each week.
 *
 * @param {Array} [nights]
 */
export function whatsOnNavItems(nights = []) {
  const { showRegular, showSpecial } = diarySectionFlags(nights);
  return withHome([
    ...(showRegular
      ? [{ href: "#series", label: diaryGroups.series.label }]
      : []),
    ...(showSpecial
      ? [{ href: "#special", label: diaryGroups.special.label }]
      : []),
    { href: "/whats-on/schedule", label: "Full schedule" },
  ]);
}

/** Featured artist: this page's galleries, when they have pictures. */
export function artistNavItems(artist) {
  return withHome([
    ...(artist?.gwenda?.length
      ? [{ href: "#at-gwenda", label: "At Gwenda" }]
      : []),
    ...(artist?.art?.length ? [{ href: "#work", label: "More" }] : []),
  ]);
}
