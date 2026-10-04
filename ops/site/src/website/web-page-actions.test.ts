import { describe, expect, it } from "vitest";
import { retryJobAction, updateAllAction, updateNowAction } from "./web-page-actions";

const site = { known: true, items: [] as unknown[], updating: false, failed: false };

describe("updateNowAction", () => {
	it("is available with changes waiting, after a failure, or before tracking starts", () => {
		expect(updateNowAction({ ...site, items: [1] }, false, false)).toEqual({ disabled: false });
		expect(updateNowAction({ ...site, failed: true }, false, false)).toEqual({ disabled: false });
		expect(updateNowAction({ ...site, known: false }, false, false)).toEqual({ disabled: false });
	});

	it("stays in place, disabled, with a reason otherwise", () => {
		expect(updateNowAction(site, false, false).reason).toBe("Already up to date");
		expect(updateNowAction({ ...site, items: [1], updating: true }, false, false).reason).toBe(
			"It's updating now",
		);
		expect(updateNowAction(null, false, false).reason).toBe("Checking the website…");
		expect(updateNowAction({ ...site, items: [1] }, true, false).reason).toBe(
			"Site builds only run in the real ops app",
		);
	});

	it("is disabled without a reason while other work runs", () => {
		expect(updateNowAction({ ...site, items: [1] }, false, true)).toEqual({ disabled: true });
	});
});

describe("updateAllAction", () => {
	it("needs something to put on the website", () => {
		expect(updateAllAction(0, false)).toEqual({ disabled: true, reason: "Nothing to put on the website" });
		expect(updateAllAction(3, false)).toEqual({ disabled: false });
	});
});

describe("retryJobAction", () => {
	it("only retries a failed job", () => {
		expect(retryJobAction("failed", false)).toEqual({ disabled: false });
		expect(retryJobAction("waiting", false).reason).toBe("Still getting it ready");
	});
});
