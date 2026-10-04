import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import ConfirmDialog from "./ConfirmDialog.svelte";
import { Confirm } from "./confirm.svelte";

describe("Confirm", () => {
	it("resolves true on the action and closes", async () => {
		const confirm = new Confirm();
		const asked = confirm.ask({ title: "Delete Jo?", action: "Delete" });
		expect(confirm.open).toBe(true);
		await confirm.accept();
		await expect(asked).resolves.toBe(true);
		expect(confirm.open).toBe(false);
	});

	it("resolves false on cancel", async () => {
		const confirm = new Confirm();
		const asked = confirm.ask({ title: "Delete Jo?", action: "Delete" });
		confirm.cancel();
		await expect(asked).resolves.toBe(false);
		expect(confirm.open).toBe(false);
	});

	it("a second ask cancels the first", async () => {
		const confirm = new Confirm();
		const first = confirm.ask({ title: "One?", action: "Delete" });
		const second = confirm.ask({ title: "Two?", action: "Delete" });
		await expect(first).resolves.toBe(false);
		expect(confirm.request?.title).toBe("Two?");
		confirm.cancel();
		await expect(second).resolves.toBe(false);
	});

	it("run keeps the dialog open with the error when the work fails", async () => {
		const confirm = new Confirm();
		let tries = 0;
		const asked = confirm.run({ title: "Delete Jo?", action: "Delete" }, async () => {
			tries += 1;
			if (tries === 1) throw new Error("Baserow said no.");
		});
		await confirm.accept();
		expect(confirm.open).toBe(true);
		expect(confirm.error).toBe("Baserow said no.");
		await confirm.accept();
		expect(confirm.open).toBe(false);
		await expect(asked).resolves.toBe(true);
	});
});

describe("ConfirmDialog", () => {
	it("names what goes, says what happens, and offers Cancel and a red action", () => {
		const confirm = new Confirm();
		void confirm.ask({
			title: "Delete Negroni?",
			message: "It comes off every menu. This can't be undone.",
			action: "Delete",
		});
		const body = render(ConfirmDialog, { props: { confirm } }).body;
		expect(body).toContain("Delete Negroni?");
		expect(body).toContain("It comes off every menu. This can't be undone.");
		expect(body).toMatch(/btn outline[^>]*>[\s\S]*?Cancel/);
		expect(body).toMatch(/btn destructive[^>]*>[\s\S]*?Delete/);
	});

	it("uses the primary style for a safe but big step", () => {
		const body = render(ConfirmDialog, {
			props: { open: true, title: "Update the website?", action: "Update website", tone: "primary" },
		}).body;
		expect(body).toMatch(/btn primary[^>]*>[\s\S]*?Update website/);
		expect(body).not.toContain("btn destructive");
	});

	it("renders nothing while closed", () => {
		const body = render(ConfirmDialog, { props: { open: false, title: "Delete?" } }).body;
		expect(body).not.toContain("Delete?");
	});
});
