import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileTabFor } from "./mobile-nav.ts";

describe("mobileTabFor", () => {
	it("keeps Recipes and Inventory on Stock", () => {
		assert.equal(mobileTabFor("/menu"), "stock");
		assert.equal(mobileTabFor("/menu/negroni"), "stock");
		assert.equal(mobileTabFor("/inventory"), "stock");
		assert.equal(mobileTabFor("/lightspeed"), "stock");
		assert.equal(mobileTabFor("/suppliers"), "stock");
	});

	it("puts Sections and Configuration on More", () => {
		assert.equal(mobileTabFor("/sections"), "more");
		assert.equal(mobileTabFor("/config"), "more");
		assert.equal(mobileTabFor("/users"), "more");
	});
});
