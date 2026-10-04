import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { SupplierDialog, hostLabel, sortSuppliers, supplierId, usageLabel } from "./suppliers.svelte";

describe("suppliers page", () => {
	it("labels a card", () => {
		assert.equal(hostLabel("https://www.lwc-drinks.co.uk/trade"), "lwc-drinks.co.uk");
		assert.equal(hostLabel("lwc drinks"), "lwc drinks");
		assert.equal(hostLabel(undefined), "");
		assert.equal(usageLabel(0), "0 items");
		assert.equal(usageLabel(1), "1 item");
		assert.equal(usageLabel(undefined), "0 items");
		assert.equal(supplierId({ name: "A", _id: "x" }), "x");
		assert.equal(supplierId({ name: "A", id: "7", _id: "x" }), "7");
	});

	it("sorts by name, ignoring case", () => {
		const out = sortSuppliers([{ name: "hills" }, { name: "Amathus" }, { name: "LWC" }]);
		assert.deepEqual(out.map((row) => row.name), ["Amathus", "hills", "LWC"]);
	});

	it("the dialog adds with a blank form", () => {
		const dialog = new SupplierDialog();
		dialog.edit({ id: "1", name: "LWC", website: "https://lwc.co.uk", notes: "Tue" });
		dialog.close();
		dialog.add();
		assert.equal(dialog.open, true);
		assert.equal(dialog.editingId, "");
		assert.equal(dialog.title, "Add supplier");
		assert.equal(dialog.submitLabel, "Add supplier");
		assert.deepEqual(dialog.body(), { name: "", website: "", notes: "" });
		assert.equal(dialog.errors()["supplier-name"], "Add the supplier's name.");
	});

	it("the dialog edits a supplier and trims what it sends", () => {
		const dialog = new SupplierDialog();
		dialog.edit({ id: "1", name: "LWC", website: "https://lwc.co.uk", notes: "Tue" });
		assert.equal(dialog.title, "Edit supplier");
		assert.equal(dialog.submitLabel, "Save");
		dialog.name = "  LWC Drinks ";
		assert.deepEqual(dialog.body(), { name: "LWC Drinks", website: "https://lwc.co.uk", notes: "Tue" });
		assert.equal(dialog.errors()["supplier-name"], "");
		dialog.close();
		assert.equal(dialog.open, false);
	});
});
