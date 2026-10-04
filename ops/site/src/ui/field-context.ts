/**
 * What a Field tells the control inside it: the ids its hint or error use
 * (for aria-describedby), whether it is showing an error (aria-invalid),
 * and a way for the control to report its own problem, such as a time it
 * could not read. Controls outside a Field get nothing and behave as before.
 */
import { getContext, setContext } from "svelte";

export type FieldContext = {
	readonly describedBy: string | undefined;
	readonly invalid: boolean;
	/** The control's own message ("" clears it). A Field `error` wins over it. */
	setLocalError(message: string): void;
};

const KEY = Symbol("field");

export function setFieldContext(ctx: FieldContext) {
	setContext(KEY, ctx);
}

export function getFieldContext(): FieldContext | undefined {
	return getContext<FieldContext | undefined>(KEY);
}

/** Join id lists for aria-describedby, dropping blanks. */
export function joinIds(...ids: (string | undefined | null | false)[]): string | undefined {
	const out = ids.filter(Boolean).join(" ").trim();
	return out || undefined;
}

export const FIELD_WIDTHS = ["xs", "sm", "md", "lg", "full"] as const;
export type FieldWidth = (typeof FIELD_WIDTHS)[number];
