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
 * @param {{ showMenu?: boolean, showGallery?: boolean, signupLabel?: string }} [options]
 */
export function homeAnchorItems({
  showMenu = false,
  showGallery = false,
  signupLabel = "Join the experience",
} = {}) {
  return [
    { href: "#story", label: "Behind the doors" },
    ...(showMenu ? [{ href: "#menu", label: "Menu" }] : []),
    { href: "#what-we-do", label: "What's on" },
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
