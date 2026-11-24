/**
 * The signed-in person's access in the app (#375): their level on each area
 * (src/access/areas.js), from /api/auth/me. The menu hides what they have
 * no access to; a page they can only look at is view-only (AreaScope), and
 * its buttons that change things are disabled with the reason. The server
 * refuses the same (functions/_middleware.js), so this is the friendly half.
 *
 * On dev an owner can view ops as a role sees it: viewAs() sets a cookie
 * the server reads (access.js viewAsFrom) and reloads.
 */
import { getContext, setContext } from "svelte";
import { AREAS } from "./areas.js";
import type { AuthMe } from "../app/api";

export type Level = "none" | "view" | "edit";

const state = $state<{ owner: boolean; levels: Record<string, Level> | null }>({
  owner: true,
  levels: null,
});

/** From /api/auth/me, once at boot. No access at all (an old server): everything, as before roles. */
export function setAccess(me: AuthMe | null) {
  state.owner = me?.access?.owner ?? true;
  state.levels = me?.access?.levels ?? null;
}

/** Their level on an area; an unknown area, or no levels yet, is edit (the server still decides). */
export function levelOf(area: string | undefined): Level {
  if (!area || !state.levels) return "edit";
  return state.levels[area] ?? "edit";
}

export const canSee = (area: string | undefined) => levelOf(area) !== "none";
export const canEdit = (area: string | undefined) => levelOf(area) === "edit";

export const areaLabel = (area: string) =>
  AREAS.find((candidate) => candidate.id === area)?.label || area;

/** Why they can't change an area, in plain words; "" when they can. */
export function editReason(area: string | undefined): string {
  if (!area) return "";
  const level = levelOf(area);
  if (level === "edit") return "";
  return level === "view"
    ? `You can look at ${areaLabel(area)} but not change it. Ask an owner.`
    : `You don't have access to ${areaLabel(area)}. Ask an owner.`;
}

/** Why they can't open an area's page; "" when they can. */
export const seeReason = (area: string | undefined) =>
  canSee(area)
    ? ""
    : `You don't have access to ${area ? areaLabel(area) : "this"}. Ask an owner.`;

/* The area a page belongs to, for the buttons and grids inside it. */
const AREA_KEY = Symbol("ops-area");

export function setAreaScope(area: () => string | undefined) {
  setContext(AREA_KEY, area);
}

/** Why controls in this page can't change things ("" when they can, or outside any page). */
export function scopeEditReason(): () => string {
  const area = getContext<(() => string | undefined) | undefined>(AREA_KEY);
  return () => (area ? editReason(area()) : "");
}

/** The cookie the server reads on dev (src/access/server/access.js VIEW_AS_COOKIE). */
const VIEW_AS_COOKIE = "ops_view_as";

/** Look at ops as a role sees it (dev only), or as yourself again with null / the Owner role. */
export function viewAs(roleId: number | null) {
  document.cookie =
    roleId == null
      ? `${VIEW_AS_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${VIEW_AS_COOKIE}=${roleId}; Path=/; SameSite=Lax`;
  location.reload();
}
