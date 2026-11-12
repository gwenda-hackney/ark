import { describe, expect, it } from "vitest";
import { parseShellPath } from "../app/spa-path.js";
import { configTab, configTabPath } from "./config-tabs";

describe("configuration tabs", () => {
	it("opens on pour cost, and on the tab in the address", () => {
		expect(configTab(parseShellPath("/config").tab)).toBe("pour");
		expect(configTab(parseShellPath("/config/tasks").tab)).toBe("tasks");
		expect(configTab(parseShellPath("/config/nonsense").tab)).toBe("pour");
	});

	it("sends the old menu sections tab, and the Sections page before it, to Menus (#305)", () => {
		expect(parseShellPath("/config/sections")).toEqual({ page: "menus", slug: null, isNew: false, moved: true });
		expect(parseShellPath("/sections")).toEqual({ page: "menus", slug: null, isNew: false, moved: true });
	});

	it("keeps the first tab's address short", () => {
		expect(configTabPath("pour")).toBe("/config");
		expect(configTabPath("tasks")).toBe("/config/tasks");
	});
});
