import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	hideShellChrome,
	isStockListPath,
	isToolId,
	mobileTabFor,
	stockSwitchValue,
	toolFrameFor,
} from "./mobile-nav.ts";

describe("mobile-nav", () => {
	it("groups menu and inventory under Stock", () => {
		assert.equal(mobileTabFor("/"), "home");
		assert.equal(mobileTabFor("/menu"), "stock");
		assert.equal(mobileTabFor("/menu/negroni"), "stock");
		assert.equal(mobileTabFor("/inventory"), "stock");
		assert.equal(mobileTabFor("/inventory/gin"), "stock");
		assert.equal(mobileTabFor("/config"), "more");
		assert.equal(mobileTabFor("/users"), "more");
		assert.equal(mobileTabFor("/tools/breakeven"), "more");
	});

	it("treats only the list pages as the Stock switcher surface", () => {
		assert.equal(isStockListPath("/menu"), true);
		assert.equal(isStockListPath("/inventory"), true);
		assert.equal(isStockListPath("/menu/negroni"), false);
		assert.equal(isStockListPath("/inventory/new"), false);
		assert.equal(isStockListPath("/"), false);
	});

	it("hides bottom tabs on editors", () => {
		assert.equal(hideShellChrome("/menu/negroni"), true);
		assert.equal(hideShellChrome("/menu/new"), true);
		assert.equal(hideShellChrome("/inventory/gin"), true);
		assert.equal(hideShellChrome("/menu"), false);
		assert.equal(hideShellChrome("/"), false);
	});

	it("maps Stock switcher to the current list", () => {
		assert.equal(stockSwitchValue("/menu"), "menu");
		assert.equal(stockSwitchValue("/menu/negroni"), "menu");
		assert.equal(stockSwitchValue("/inventory"), "inventory");
	});

	it("resolves iframe tools without colliding with /stock HTML", () => {
		assert.equal(isToolId("breakeven"), true);
		assert.equal(isToolId("menu"), false);
		assert.equal(toolFrameFor("/tools/cashflow").src, "/cashflow/");
		assert.equal(toolFrameFor("/tools/stock").title, "Wholesale stock");
		assert.equal(toolFrameFor("/tools/nope").src, "/breakeven/");
	});
});
