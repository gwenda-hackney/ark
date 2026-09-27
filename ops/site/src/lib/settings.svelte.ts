/**
 * House pour-cost targets from the Baserow config database (via /api/config).
 * Defaults match the drink-type model until the first successful load.
 */
import {
	DEFAULT_POUR_TARGETS,
	normalizePourTargets,
	type PourTargetMap,
} from "./types.ts";
import * as api from "./api.ts";

export const pourSettings = $state({
	targets: { ...DEFAULT_POUR_TARGETS } as PourTargetMap,
	loaded: false,
	saving: false,
	error: "",
});

let loadPromise: Promise<void> | null = null;

export function loadPourSettings(): Promise<void> {
	if (pourSettings.loaded) return Promise.resolve();
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		pourSettings.error = "";
		try {
			const data = await api.getConfig();
			pourSettings.targets = normalizePourTargets(data.pourTargets);
			pourSettings.loaded = true;
		} catch (err) {
			pourSettings.error =
				err instanceof Error ? err.message : "Could not load configuration.";
			// Keep defaults so recipe analysis still works offline / before setup.
			pourSettings.loaded = true;
		} finally {
			loadPromise = null;
		}
	})();
	return loadPromise;
}

export async function setPourTargets(next: Partial<PourTargetMap>) {
	const targets = normalizePourTargets({
		...pourSettings.targets,
		...next,
	});
	const previous = { ...pourSettings.targets };
	pourSettings.targets = targets;
	pourSettings.saving = true;
	pourSettings.error = "";
	try {
		const data = await api.updateConfig({ pourTargets: targets });
		pourSettings.targets = normalizePourTargets(data.pourTargets);
		pourSettings.loaded = true;
	} catch (err) {
		pourSettings.targets = previous;
		pourSettings.error =
			err instanceof Error ? err.message : "Could not save configuration.";
		throw err;
	} finally {
		pourSettings.saving = false;
	}
}

export async function resetPourTargets() {
	const previous = { ...pourSettings.targets };
	pourSettings.targets = { ...DEFAULT_POUR_TARGETS };
	pourSettings.saving = true;
	pourSettings.error = "";
	try {
		const data = await api.updateConfig({ reset: true });
		pourSettings.targets = normalizePourTargets(data.pourTargets);
		pourSettings.loaded = true;
	} catch (err) {
		pourSettings.targets = previous;
		pourSettings.error =
			err instanceof Error ? err.message : "Could not reset configuration.";
		throw err;
	} finally {
		pourSettings.saving = false;
	}
}
