/** Types for the TypeScript Workers; see smoke-test.js. */
export const SIGNUP_SMOKE_EMAIL: string;
export function isSmokeSubscriber(email: unknown): boolean;
export const FORM_SMOKE_EMAIL: string;
export const FORM_SMOKE_ANSWER: string;
export function isSmokeFormSubmission(submission?: {
  replyTo?: unknown;
  answers?: unknown;
}): boolean;
