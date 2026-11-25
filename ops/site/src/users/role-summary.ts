import { AREAS } from "../access/areas.js";
import type { Level, OpsRole } from "./types";

/** What a role can do, in a line: "Edit: What's on, Email · View: Menus", or "Everything". */
export function roleSummary(role: Pick<OpsRole, "owner" | "areas">): string {
	if (role.owner) return "Everything";
	const by = (level: Level) => AREAS.filter((area) => role.areas[area.id] === level).map((area) => area.label);
	const parts = [by("edit").length ? `Edit: ${by("edit").join(", ")}` : "", by("view").length ? `View: ${by("view").join(", ")}` : ""].filter(Boolean);
	return parts.join(" · ") || "Can look, can't change anything";
}
