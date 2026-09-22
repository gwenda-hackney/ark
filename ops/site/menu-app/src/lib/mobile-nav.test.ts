import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mobileTabFor } from "./mobile-nav.ts";

describe("mobileTabFor", () => {
	it("keeps inventory and suppliers on Stock", () => {
		assert.equal(mobileTabFor("/inventory"), "stock");
		assert.equal(mobileTabFor("/suppliers"), "stock");
	});

	it("puts menu, Lightspeed, and configuration on More", () => {
		assert.equal(mobileTabFor("/menu"), "more");
		assert.equal(mobileTabFor("/menu/negroni"), "more");
		assert.equal(mobileTabFor("/sections"), "more");
		assert.equal(mobileTabFor("/lightspeed"), "more");
		assert.equal(mobileTabFor("/lightspeed/export"), "more");
		assert.equal(mobileTabFor("/lightspeed/menus"), "more");
		assert.equal(mobileTabFor("/config"), "more");
		assert.equal(mobileTabFor("/users"), "more");
		assert.equal(mobileTabFor("/web"), "more");
		assert.equal(mobileTabFor("/events"), "more");
	});
});
