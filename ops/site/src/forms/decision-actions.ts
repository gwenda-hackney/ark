/**
 * A submission's header buttons: Reply, Decline and Approve are always shown
 * in that order, disabled with a reason when they don't apply, so they never
 * jump about as a decision is made.
 */
import { actionState, type ActionState } from "../ui/action-state";

export type DecisionInput = {
	formSlug: string | null | undefined;
	decision: string | null | undefined;
	email: string | null | undefined;
	deciding: boolean;
};

export function decisionActions(input: DecisionInput): {
	reply: ActionState;
	decline: ActionState;
	approve: ActionState;
} {
	const play = input.formSlug === "play";
	const playOnly = play ? null : "Only for play applications";
	return {
		reply: actionState(String(input.email || "").trim() ? null : "No email address given"),
		decline: actionState(
			playOnly ?? (input.decision === "Declined" ? "Already declined" : null),
			input.deciding,
		),
		approve: actionState(
			playOnly ?? (input.decision === "Approved" ? "Already approved" : null),
			input.deciding,
		),
	};
}
