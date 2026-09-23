import { diaryGroups } from "./diary-groups.js";

const homeLink = { href: "/", label: "Home" };

/** Every subpage menu starts with Home. Then this page's anchors and subpages. */
export function withHome(items = []) {
  return [homeLink, ...items];
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
 * The schedule lists its own week anchors. It does not repeat this menu.
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

/** Week headings on the schedule page. */
export function scheduleNavItems(weeks = []) {
  return withHome(
    weeks.map((week) => ({
      href: `#week-${week.id}`,
      label: week.label,
    })),
  );
}
