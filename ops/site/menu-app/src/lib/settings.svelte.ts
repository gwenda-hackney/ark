/**
 * House pour-cost targets. Defaults live in the drink-type model; the gear
 * dialog writes overrides to localStorage so analysis can use them live.
 */
import {
	DEFAULT_POUR_TARGETS,
	normalizePourTargets,
	type PourTargetMap,
} from "./types.ts";

export const POUR_TARGET_STORAGE_KEY = "gwenda-ops-pour-targets";

function readStored(): PourTargetMap {
	if (typeof localStorage === "undefined") {
		return { ...DEFAULT_POUR_TARGETS };
	}
	try {
		const raw = localStorage.getItem(POUR_TARGET_STORAGE_KEY);
		if (!raw) return { ...DEFAULT_POUR_TARGETS };
		return normalizePourTargets(JSON.parse(raw) as Partial<PourTargetMap>);
	} catch {
		return { ...DEFAULT_POUR_TARGETS };
	}
}

export const pourSettings = $state({
	targets: readStored(),
});

export function setPourTargets(next: Partial<PourTargetMap>) {
	const targets = normalizePourTargets({
		...pourSettings.targets,
		...next,
	});
	pourSettings.targets = targets;
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(POUR_TARGET_STORAGE_KEY, JSON.stringify(targets));
	}
}

export function resetPourTargets() {
	pourSettings.targets = { ...DEFAULT_POUR_TARGETS };
	if (typeof localStorage !== "undefined") {
		localStorage.removeItem(POUR_TARGET_STORAGE_KEY);
	}
}
