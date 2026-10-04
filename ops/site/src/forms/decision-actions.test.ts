import { describe, expect, it } from "vitest";
import { decisionActions } from "./decision-actions";

const base = { formSlug: "play", decision: "", email: "a@b.co", deciding: false };

describe("decisionActions", () => {
	it("offers all three on an undecided play application", () => {
		const actions = decisionActions(base);
		expect(actions.reply).toEqual({ disabled: false });
		expect(actions.decline).toEqual({ disabled: false });
		expect(actions.approve).toEqual({ disabled: false });
	});

	it("keeps the made decision's button in place, disabled", () => {
		expect(decisionActions({ ...base, decision: "Approved" }).approve).toEqual({
			disabled: true,
			reason: "Already approved",
		});
		expect(decisionActions({ ...base, decision: "Declined" }).decline.reason).toBe("Already declined");
		expect(decisionActions({ ...base, decision: "Approved" }).decline.disabled).toBe(false);
	});

	it("explains decisions on other forms and a missing email", () => {
		const actions = decisionActions({ ...base, formSlug: "contact", email: "" });
		expect(actions.approve.reason).toBe("Only for play applications");
		expect(actions.decline.reason).toBe("Only for play applications");
		expect(actions.reply.reason).toBe("No email address given");
	});

	it("is disabled without a reason while a decision saves", () => {
		expect(decisionActions({ ...base, deciding: true }).approve).toEqual({ disabled: true });
	});
});
