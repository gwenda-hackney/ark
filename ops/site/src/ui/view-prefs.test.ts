import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
	densityKey,
	readDensity,
	readListView,
	readPref,
	rowHeightFor,
	viewKey,
	writePref,
} from "./view-prefs";
import { densityPref, listViewPref } from "./list-prefs.svelte";

function memoryStore(seed: Record<string, string> = {}) {
	const data = new Map(Object.entries(seed));
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
	};
}

const blocked = {
	getItem: () => {
		throw new Error("SecurityError");
	},
	setItem: () => {
		throw new Error("QuotaExceededError");
	},
};

describe("view prefs", () => {
	it("keys each page on its own", () => {
		assert.equal(densityKey("inventory"), "ops.density.inventory");
		assert.equal(viewKey("menu-items"), "ops.view.menu-items");
		assert.equal(viewKey("menu-items", true), "ops.view.menu-items.phone");
	});

	it("reads a stored value only when it is allowed", () => {
		const store = memoryStore({ a: "compact", b: "huge" });
		assert.equal(readPref("a", ["comfortable", "compact"], "comfortable", store), "compact");
		assert.equal(readPref("b", ["comfortable", "compact"], "comfortable", store), "comfortable");
		assert.equal(readPref("missing", ["x", "y"], "y", store), "y");
	});

	it("falls back when storage is blocked or missing", () => {
		assert.equal(readDensity("menu-items", blocked), "comfortable");
		assert.equal(readDensity("menu-items", null), "comfortable");
		assert.doesNotThrow(() => writePref("k", "v", blocked));
		assert.doesNotThrow(() => writePref("k", "v", null));
	});

	it("defaults to cards on a phone and the table at a desk", () => {
		const store = memoryStore();
		assert.equal(readListView("menu-items", true, store), "cards");
		assert.equal(readListView("menu-items", false, store), "table");
		store.setItem(viewKey("menu-items"), "cards");
		assert.equal(readListView("menu-items", false, store), "cards");
		assert.equal(readListView("menu-items", true, store), "cards");
		store.setItem(viewKey("menu-items", true), "table");
		assert.equal(readListView("menu-items", true, store), "table");
	});

	it("maps density to row height", () => {
		assert.equal(rowHeightFor("comfortable"), 40);
		assert.equal(rowHeightFor("compact"), 32);
	});
});

describe("reactive list prefs", () => {
	it("remembers density per page", () => {
		const store = memoryStore();
		const prior = globalThis.localStorage;
		Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
		try {
			const pref = densityPref("inventory");
			assert.equal(pref.value, "comfortable");
			pref.value = "compact";
			assert.equal(pref.value, "compact");
			assert.equal(store.data.get("ops.density.inventory"), "compact");
			assert.equal(densityPref("inventory").value, "compact");
			assert.equal(densityPref("menu-items").value, "comfortable");
		} finally {
			Object.defineProperty(globalThis, "localStorage", { value: prior, configurable: true });
		}
	});

	it("keeps phone and desk view choices apart", () => {
		const store = memoryStore();
		const prior = globalThis.localStorage;
		Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
		try {
			const phone = { matches: false };
			const pref = listViewPref("menu-items", phone);
			assert.equal(pref.value, "table");
			pref.value = "cards";
			assert.equal(store.data.get("ops.view.menu-items"), "cards");
			phone.matches = true;
			assert.equal(pref.value, "cards");
			pref.value = "table";
			assert.equal(store.data.get("ops.view.menu-items.phone"), "table");
			phone.matches = false;
			assert.equal(pref.value, "cards");
		} finally {
			Object.defineProperty(globalThis, "localStorage", { value: prior, configurable: true });
		}
	});
});
