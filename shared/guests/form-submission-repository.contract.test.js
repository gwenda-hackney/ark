/**
 * What every FormSubmissionRepository adapter must do (#186): memory,
 * Baserow (a fake Website database) and D1 (SQLite with the real migrations).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";
import { createTestD1 } from "../testing/d1-sqlite.js";
import { fakeBaserow } from "../testing/fake-baserow.js";
import {
  copyRoundTrip,
  repositoryContract,
} from "../testing/repository-contract.js";
import { baserowFormSubmissionRepository } from "./adapters/baserow-form-submissions.js";
import { memoryFormSubmissionRepository } from "./adapters/memory-form-submissions.js";
import { memorySubscriberRepository } from "./adapters/memory-subscribers.js";
import { d1Guests, guestsCopy } from "./guests-copy.js";
import { FORM_SUBMISSION_ADAPTERS, WEBSITE_TABLES } from "./testing.js";

afterEach(() => vi.unstubAllGlobals());

const ANSWERS = {
  v: 1,
  entries: [
    { key: "email", label: "Email", value: "ada@example.com" },
    { key: "artistName", label: "Artist name", value: "The Engines" },
  ],
  raw: { email: "ada@example.com", artistName: "The Engines", days: ["thu"] },
};

function submission(overrides = {}) {
  return {
    formSlug: "play",
    formTitle: "Play at Gwenda",
    submittedAt: "2026-10-01T18:00:00.000Z",
    replyTo: "ada@example.com",
    status: "Verified",
    current: true,
    answers: ANSWERS,
    notifySentAt: "2026-10-01T18:00:02.000Z",
    receiptSentAt: null,
    editLink: "https://gwenda.co.uk/contact/play?edit=token",
    ...overrides,
  };
}

async function seed(repo) {
  await repo.create(submission({ current: false }));
  await repo.create(
    submission({ submittedAt: "2026-10-02T09:00:00.000Z", status: "Pending" }),
  );
  await repo.create(
    submission({
      formSlug: "contact",
      formTitle: "Contact",
      replyTo: "grace@example.com",
      answers: [{ key: "message", label: "Message", value: "Hello" }],
      notifySentAt: null,
      editLink: "",
      status: "",
    }),
  );
  await repo.create(
    submission({ submittedAt: null, answers: null, replyTo: "" }),
  );
}

const ids = (records) => records.map((record) => record.id);

repositoryContract("FormSubmissionRepository", {
  adapters: FORM_SUBMISSION_ADAPTERS,
  seed,
  cases: {
    "every field round-trips": async (repo) => {
      const created = await repo.create(submission());
      assert.equal(typeof created.id, "number");
      assert.deepEqual(created, { id: created.id, ...submission() });
      assert.deepEqual(await repo.get(created.id), created);
      assert.equal(await repo.get(999999), null);
    },
    "fields left out are empty": async (repo) => {
      const created = await repo.create({ formSlug: "play" });
      assert.deepEqual(created, {
        id: created.id,
        formSlug: "play",
        formTitle: "",
        submittedAt: null,
        replyTo: "",
        status: "",
        current: false,
        answers: null,
        notifySentAt: null,
        receiptSentAt: null,
        editLink: "",
      });
    },
    "a form's records from one address, any case, newest first": async (
      repo,
    ) => {
      await seed(repo);
      const found = await repo.listForEmail("play", "Ada@Example.com");
      assert.deepEqual(
        found.map((record) => [record.status, record.current]),
        [
          ["Pending", true],
          ["Verified", false],
        ],
      );
      assert.deepEqual(
        await repo.listForEmail("contact", "ada@example.com"),
        [],
      );
    },
    "current records, newest first": async (repo) => {
      await seed(repo);
      const current = await repo.listCurrent();
      assert.deepEqual(
        current.map((record) => [record.formSlug, record.submittedAt]),
        [
          ["play", "2026-10-02T09:00:00.000Z"],
          ["contact", "2026-10-01T18:00:00.000Z"],
          ["play", null],
        ],
      );
    },
    "update changes only the given fields; a missing record is null": async (
      repo,
    ) => {
      const created = await repo.create(submission({ status: "Pending" }));
      const updated = await repo.update(created.id, {
        status: "Verified",
        receiptSentAt: "2026-10-01T18:05:00.000Z",
      });
      assert.deepEqual(updated, {
        ...created,
        status: "Verified",
        receiptSentAt: "2026-10-01T18:05:00.000Z",
      });
      assert.deepEqual(await repo.get(created.id), updated);
      assert.equal(await repo.update(999999, { current: false }), null);
    },
    "removes and counts": async (repo) => {
      await seed(repo);
      assert.equal(await repo.count(), 4);
      const [first] = await repo.listCurrent();
      await repo.remove(first.id);
      await repo.remove(first.id);
      assert.equal(await repo.count(), 3);
      assert.equal(await repo.get(first.id), null);
      assert.ok(!ids(await repo.listCurrent()).includes(first.id));
    },
    "keeps the edit link": async (repo) => {
      assert.deepEqual(await repo.capabilities(), { editLink: true });
    },
  },
});

describe("FormSubmissionRepository (baserow) before the Edit Link column", () => {
  it("saves everything else, and says it can't keep the link yet", async () => {
    const { "Edit Link": _gone, ...columns } =
      WEBSITE_TABLES["Form Submissions"];
    const baserow = fakeBaserow({ tables: { "Form Submissions": columns } });
    vi.stubGlobal("fetch", baserow.fetch);
    const repo = baserowFormSubmissionRepository({
      BASEROW_API_KEY: baserow.token,
      BASEROW_API_URL: baserow.url,
    });
    const created = await repo.create(submission());
    assert.equal(created.formTitle, "Play at Gwenda");
    assert.deepEqual(await repo.capabilities(), { editLink: false });
    assert.ok(await repo.update(created.id, { editLink: "https://x.test" }));
  });
});

describe("guests copy", () => {
  it("moves subscribers and form submissions together, ids kept", async () => {
    const source = guestsCopy({
      subscribers: memorySubscriberRepository(),
      formSubmissions: memoryFormSubmissionRepository(),
    });
    const db = createTestD1("website");
    const { snapshot } = await copyRoundTrip(source, d1Guests(db), async () => {
      const subscribers = memorySubscriberRepository();
      const forms = memoryFormSubmissionRepository();
      await subscribers.create({ email: "ada@example.com", tags: ["wifi"] });
      await forms.create(submission());
      await forms.create(submission({ current: false }));
      await source.importAll({
        ...(await subscribers.exportAll()),
        ...(await forms.exportAll()),
      });
    });
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(snapshot).map(([name, records]) => [
          name,
          records.length,
        ]),
      ),
      { subscribers: 1, formSubmissions: 2 },
    );
  });
});
