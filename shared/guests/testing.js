/** Test helpers for the guests repositories: each adapter, fresh. */
import { createTestD1 } from "../testing/d1-sqlite.js";
import { d1FormSubmissionRepository } from "./adapters/d1-form-submissions.js";
import { d1SubscriberRepository } from "./adapters/d1-subscribers.js";
import { memoryFormSubmissionRepository } from "./adapters/memory-form-submissions.js";
import { memorySubscriberRepository } from "./adapters/memory-subscribers.js";

export const SUBSCRIBER_ADAPTERS = {
  memory: () => memorySubscriberRepository(),
  d1: () => d1SubscriberRepository(createTestD1("website")),
};

export const FORM_SUBMISSION_ADAPTERS = {
  memory: () => memoryFormSubmissionRepository(),
  d1: () => d1FormSubmissionRepository(createTestD1("website")),
};
