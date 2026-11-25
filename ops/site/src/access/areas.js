/**
 * Ops access by area (#375): each part of ops, what of the API it owns, and
 * the three levels a person can have on it. The one list both the server
 * (functions/_middleware.js refuses what a level doesn't allow) and the app
 * (the menu, disabled buttons) read.
 *
 *   none  not in their menu; every change refused. Reads stay open to staff,
 *         since pages read each other's data (Menus lists pop-up nights),
 *         except in a `guarded` area, whose reads are refused too.
 *   view  they can look; every change refused.
 *   edit  they can look and change.
 *
 * An owner has edit on everything, whatever their role says.
 */

export const LEVELS = /** @type {const} */ (["none", "view", "edit"]);

/**
 * @typedef {{ id: string, label: string, hint: string, guarded?: boolean, api: RegExp[] }} Area
 * `api`: the /api paths it owns. The first area whose pattern matches a path
 * owns it, so a narrow area comes before a broad one.
 */

/** @type {Area[]} */
export const AREAS = [
  {
    id: "email-people",
    label: "Guest email list",
    hint: "Guests' email addresses and visits",
    guarded: true,
    api: [/^\/api\/email\/people(\/|$)/],
  },
  {
    id: "email-send",
    label: "Sending emails",
    hint: "Send to the mailing list, and the monthly email's schedule",
    guarded: true,
    api: [
      /^\/api\/email\/one-off\/[^/]+\/send(\/|$)/,
      /^\/api\/email\/(prepare|approve|send-again|settings|audience)(\/|$)/,
    ],
  },
  {
    id: "email",
    label: "Writing emails",
    hint: "Write emails and send yourself a test",
    api: [/^\/api\/email(\/|$)/],
  },
  {
    id: "whats-on",
    label: "What's on",
    hint: "Nights, pop-ups and deals",
    api: [/^\/api\/events(\/|$)/],
  },
  { id: "occasions", label: "Occasions", hint: "Christmas parties and the like", api: [/^\/api\/occasions(\/|$)/] },
  {
    id: "artists",
    label: "Enquiries",
    hint: "What people sent through the website's forms, and the featured artist",
    api: [/^\/api\/(artists|forms)(\/|$)/],
  },
  { id: "photos", label: "Photos", hint: "The venue's photos on the website", api: [/^\/api\/venue\/gallery(\/|$)/] },
  {
    id: "menus",
    label: "Menus and items",
    hint: "Drinks and pop-up menus, every drink and dish",
    api: [/^\/api\/(menu|menus)(\/|$)/],
  },
  {
    id: "stock",
    label: "Stock",
    hint: "Inventory and suppliers",
    api: [/^\/api\/(inventory|suppliers)(\/|$)/],
  },
  { id: "lightspeed", label: "Lightspeed", hint: "Till menus, reconcile and export", api: [/^\/api\/pos-menus(\/|$)/] },
  { id: "venue", label: "Venue", hint: "Opening hours and parties", api: [/^\/api\/venue(\/|$)/] },
  {
    id: "website",
    label: "Website",
    hint: "Put changes live, and releases",
    api: [/^\/api\/web\/(update|promote|release|pending|status|deploy-status)(\/|$)/],
  },
  { id: "config", label: "Configuration", hint: "Pour targets, event tasks", api: [/^\/api\/config(\/|$)/] },
  { id: "users", label: "Users", hint: "Who may sign in, and what they can do", guarded: true, api: [/^\/api\/(users|roles)(\/|$)/] },
  {
    id: "devtools",
    label: "Developer tools",
    hint: "Code, databases, copying production to dev",
    guarded: true,
    api: [/^\/api\/web\/(code|databases|dev-copy|settings)(\/|$)/],
  },
];

/**
 * API paths every signed-in person may use whatever their levels: who they
 * are, the dashboard, error counts, and the website following saves (it
 * publishes what each area already let them save).
 */
export const OPEN_API = [
  /^\/api\/auth(\/|\.js$|$)/,
  /^\/api\/dashboard(\/|$)/,
  /^\/api\/health(\/|$)/,
  /^\/api\/web\/(tick|jobs)(\/|$)/,
];

export const AREA_IDS = AREAS.map((area) => area.id);

/** "open", the id of the area that owns an /api path, or null for one no area owns (refused). */
export function areaForApiPath(pathname) {
  const path = String(pathname || "");
  if (OPEN_API.some((pattern) => pattern.test(path))) return "open";
  const area = AREAS.find((candidate) => candidate.api.some((pattern) => pattern.test(path)));
  return area ? area.id : null;
}

export const isRead = (method) => ["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());

/** A level, or "none" for anything that isn't one. */
export function level(value) {
  return LEVELS.includes(value) ? value : "none";
}

/** The higher of two levels. */
export function higher(a, b) {
  return LEVELS.indexOf(level(a)) >= LEVELS.indexOf(level(b)) ? level(a) : level(b);
}

/**
 * Every area's level for one person: their role's; an owner has edit on
 * everything.
 * @param {{ owner?: boolean, areas?: Record<string, string> } | null} role
 * @returns {Record<string, "none" | "view" | "edit">}
 */
export function levelsFor(role) {
  return Object.fromEntries(AREA_IDS.map((id) => [id, role?.owner ? "edit" : level(role?.areas?.[id])]));
}

/**
 * Whether a request may go ahead: null when it may, else why not, in words.
 * @param {Record<string, string>} levels from levelsFor
 */
export function refusalFor(levels, pathname, method) {
  const areaId = areaForApiPath(pathname);
  if (areaId === "open") return null;
  if (!areaId) return "That isn't part of any area of ops you can use.";
  const area = AREAS.find((candidate) => candidate.id === areaId);
  const have = level(levels?.[areaId]);
  if (isRead(method)) {
    if (have === "none" && area.guarded) return `You don't have access to ${area.label}. Ask an owner.`;
    return null;
  }
  if (have === "edit") return null;
  return have === "view"
    ? `You can view ${area.label} but not change it. Ask an owner.`
    : `You don't have access to ${area.label}. Ask an owner.`;
}
