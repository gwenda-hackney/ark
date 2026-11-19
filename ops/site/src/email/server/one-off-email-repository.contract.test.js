/**
 * What every OneOffEmailRepository adapter must do (#348): the same cases on
 * memory and D1 (SQLite with the real migrations), plus the copy between
 * them. Only a draft changes or goes; a move happens once.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { d1OneOffEmailRepository } from "./adapters/d1-one-off-email.js";
import { memoryOneOffEmailRepository } from "./adapters/memory-one-off-email.js";
import { oneOffEmailRepository } from "./one-off-email-repository.js";

const ADAPTERS = {
  memory: () => memoryOneOffEmailRepository(),
  d1: () => d1OneOffEmailRepository(createTestD1("ops")),
};

const NOW = new Date("2026-11-18T10:00:00Z");
const LATER = new Date("2026-11-18T10:05:00Z");
const SECTIONS = [
  { kind: "image", assetId: "image-abc123-1600x1200-jpg", alt: "The bar" },
  { kind: "heading", text: "New Year's Eve" },
  { kind: "copy", text: "Doors at **9**.\n\nSee [the page](https://gwenda.co.uk/nye)." },
  { kind: "button", label: "Get tickets", link: "https://gwenda.co.uk/nye", look: "link" },
];

repositoryContract("OneOffEmailRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    const sent = await repo.create({ subject: "Opening night", sections: SECTIONS, by: "a@example.com", now: NOW });
    await repo.move(sent.id, ["draft"], "sent", { campaignId: "c1", recipients: 244, sentAt: NOW.toISOString() }, NOW);
    await repo.create({ subject: "NYE", previewText: "Doors at 9", sections: SECTIONS, by: "b@example.com", now: LATER });
  },
  cases: {
    "creates a draft, and every field round-trips": async (repo) => {
      const email = await repo.create({
        subject: "  New   Year  ",
        previewText: "Doors at 9",
        sections: [...SECTIONS, { kind: "raw", html: "<script>" }],
        by: "Someone@Example.com",
        now: NOW,
      });
      assert.deepEqual(email, {
        id: email.id,
        subject: "New Year",
        previewText: "Doors at 9",
        sections: SECTIONS,
        status: "draft",
        campaignId: "",
        campaignWebId: "",
        recipients: 0,
        reason: "",
        createdBy: "someone@example.com",
        updatedBy: "someone@example.com",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        scheduledFor: null,
        sentAt: null,
      });
      assert.ok(email.id > 0);
      assert.deepEqual(await repo.get(email.id), email);
      assert.equal(await repo.get(987_654), null);
    },
    "changes a draft's subject, preview line and sections, and nothing else": async (repo) => {
      const email = await repo.create({ subject: "Draft", by: "a@example.com", now: NOW });
      const changed = await repo.updateDraft(
        email.id,
        { subject: "NYE", previewText: "Soon", sections: SECTIONS.slice(1), status: "sent", id: 77, createdBy: "x" },
        { by: "b@example.com", now: LATER },
      );
      assert.deepEqual(changed, {
        ...email,
        subject: "NYE",
        previewText: "Soon",
        sections: SECTIONS.slice(1),
        updatedBy: "b@example.com",
        updatedAt: LATER.toISOString(),
      });
      // Only the fields given change.
      const again = await repo.updateDraft(email.id, { previewText: "" }, { by: "b@example.com", now: LATER });
      assert.equal(again.subject, "NYE");
      assert.equal(again.previewText, "");
      assert.deepEqual(again.sections, SECTIONS.slice(1));
      assert.equal(await repo.updateDraft(987_654, { subject: "x" }, { now: LATER }), null);
    },
    "won't change or delete one that isn't a draft": async (repo) => {
      const email = await repo.create({ subject: "Going", now: NOW });
      const sending = await repo.move(email.id, ["draft"], "sending", { campaignId: "c1" }, LATER);
      assert.equal(sending.status, "sending");
      assert.equal(sending.campaignId, "c1");
      assert.equal(await repo.updateDraft(email.id, { subject: "Changed" }, { now: LATER }), null);
      assert.equal(await repo.removeDraft(email.id), false);
      assert.equal((await repo.get(email.id)).subject, "Going");
    },
    "deletes a draft": async (repo) => {
      const email = await repo.create({ subject: "Gone", now: NOW });
      assert.equal(await repo.removeDraft(email.id), true);
      assert.equal(await repo.get(email.id), null);
      assert.equal(await repo.removeDraft(email.id), false);
    },
    "moves an email only from the statuses given, and only once": async (repo) => {
      const email = await repo.create({ subject: "Once", sections: SECTIONS, now: NOW });
      const both = await Promise.all([
        repo.move(email.id, ["draft"], "sending", {}, LATER),
        repo.move(email.id, ["draft"], "sending", {}, LATER),
      ]);
      assert.equal(both.filter(Boolean).length, 1);
      const sent = await repo.move(
        email.id,
        ["sending"],
        "sent",
        { recipients: 244, sentAt: LATER.toISOString(), subject: "Not this", sections: [] },
        LATER,
      );
      assert.equal(sent.status, "sent");
      assert.equal(sent.recipients, 244);
      assert.equal(sent.sentAt, LATER.toISOString());
      // A move never changes what the email says.
      assert.equal(sent.subject, "Once");
      assert.deepEqual(sent.sections, SECTIONS);
      assert.equal(await repo.move(email.id, ["draft"], "sending", {}, LATER), null);
      assert.equal(await repo.move(987_654, ["draft"], "sending", {}, LATER), null);
    },
    "lists the most recently changed first": async (repo) => {
      const first = await repo.create({ subject: "First", now: NOW });
      const second = await repo.create({ subject: "Second", now: NOW });
      const third = await repo.create({ subject: "Third", now: NOW });
      await repo.updateDraft(first.id, { subject: "First, changed" }, { now: LATER });
      assert.deepEqual(
        (await repo.list(10)).map((email) => email.id),
        [first.id, third.id, second.id],
      );
      assert.equal((await repo.list(1)).length, 1);
    },
  },
});

describe("oneOffEmailRepository", () => {
  it("is the ops database's, or the one a test hands in", async () => {
    const repo = memoryOneOffEmailRepository();
    assert.equal(oneOffEmailRepository({ oneOffEmailRepository: repo }), repo);
    const OPS_DB = createTestD1("ops");
    const email = await oneOffEmailRepository({ SITE_ENV: "dev", OPS_DB }).create({ subject: "Hi", now: NOW });
    assert.equal((await d1OneOffEmailRepository(OPS_DB).get(email.id)).subject, "Hi");
  });
});
