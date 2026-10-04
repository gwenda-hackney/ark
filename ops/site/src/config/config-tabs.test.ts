import { describe, expect, it } from "vitest";
import { parseShellPath } from "../app/spa-path.js";
import { configTab, configTabPath } from "./config-tabs";

describe("configuration tabs", () => {
	it("opens on menu sections, and on the tab in the address", () => {
		expect(configTab(parseShellPath("/config").tab)).toBe("sections");
		expect(configTab(parseShellPath("/config/pour").tab)).toBe("pour");
		expect(configTab(parseShellPath("/config/nonsense").tab)).toBe("sections");
	});

	it("sends the old Sections page to its tab", () => {
		expect(parseShellPath("/sections")).toEqual({ page: "config", tab: "sections" });
	});

	it("keeps the first tab's address short", () => {
		expect(configTabPath("sections")).toBe("/config");
		expect(configTabPath("tasks")).toBe("/config/tasks");
	});
});
