/**
 * Test helpers for the guests repositories: each adapter, fresh. The Baserow
 * ones run against a fake Website database (shared/testing/fake-baserow.js).
 */
import { vi } from "vitest";
import { createTestD1 } from "../testing/d1-sqlite.js";
import { fakeBaserow } from "../testing/fake-baserow.js";
import { baserowFormSubmissionRepository } from "./adapters/baserow-form-submissions.js";
import { baserowSubscriberRepository } from "./adapters/baserow-subscribers.js";
import { d1FormSubmissionRepository } from "./adapters/d1-form-submissions.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";
import { memoryFormSubmissionRepository } from "./adapters/memory-form-submissions.js";
import { memorySubscriberRepository } from "./adapters/memory-subscribers.js";

/** The Website database's guest tables, with the column types setup creates. */
export const WEBSITE_TABLES = {
  Subscribers: {
    Email: "text",
    Tag: "multiple_select",
    "Signed up": "date",
    Synced: "boolean",
  },
  "Form Submissions": {
    "Form Slug": "text",
    Submitted: "date",
    "Form Title": "text",
    "Reply To": "text",
    Status: "single_select",
    Current: "boolean",
    Answers: "long_text",
    "Notify Sent": "date",
    "Receipt Sent": "date",
    "Edit Link": "url",
  },
};

/** A fake Website Baserow behind fetch, and the env its adapters need. */
export function fakeWebsiteBaserow(tables = WEBSITE_TABLES) {
  const baserow = fakeBaserow({ tables });
  vi.stubGlobal("fetch", baserow.fetch);
  return {
    baserow,
    env: { BASEROW_API_KEY: baserow.token, BASEROW_API_URL: baserow.url },
  };
}

export const SUBSCRIBER_ADAPTERS = {
  memory: () => memorySubscriberRepository(),
  baserow: () => baserowSubscriberRepository(fakeWebsiteBaserow().env),
  d1: () => d1SubscriberRepository(createTestD1("website")),
};

export const FORM_SUBMISSION_ADAPTERS = {
  memory: () => memoryFormSubmissionRepository(),
  baserow: () => baserowFormSubmissionRepository(fakeWebsiteBaserow().env),
  d1: () => d1FormSubmissionRepository(createTestD1("website")),
};
