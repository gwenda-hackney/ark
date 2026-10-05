import { describe, expect, it } from "vitest";
import { frozenList } from "./frozen-label";

describe("frozenList", () => {
	it("names frozen features the way people say them", () => {
		expect(frozenList(["events"])).toBe("Events");
		expect(frozenList(["events", "artists"])).toBe("Events and Artists");
		expect(frozenList(["events", "menu", "users"])).toBe("Events, Menu and inventory and Users");
		expect(frozenList(["something-new"])).toBe("something-new");
	});
});
