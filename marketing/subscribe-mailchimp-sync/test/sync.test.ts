import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { memorySubscriberRepository } from "../../../shared/guests/adapters/memory-subscribers.js";
import type { SubscriberRecord } from "../../../shared/guests/subscribers.js";
import {
  isAuthorized,
  isRateLimited,
  mailchimpSubscriberHash,
  normalizeEmail,
  normalizeSignedUp,
  permanentRejection,
  resolveAudienceId,
  SIGNED_UP_MERGE_TAG,
  syncUnsyncedSubscribers,
  upsertMailchimpMember,
} from "../src/sync";
import type { Env } from "../src/types";

const env: Env = {
  BASEROW_API_KEY: "baserow-key",
  MAILCHIMP_API_KEY: "mailchimp-key-us2",
  SYNC_SECRET: "sync-secret",
  MAILCHIMP_AUDIENCE_ID: "e2c69d5d31",
  BASEROW_API_URL: "https://api.baserow.io",
};

describe("helpers", () => {
  it("normalizes emails", () => {
    expect(normalizeEmail("  Dan@Gwenda.co.uk ")).toBe("dan@gwenda.co.uk");
    expect(normalizeEmail("nope")).toBeNull();
  });

  it("normalizes signed-up dates", () => {
    expect(normalizeSignedUp("2026-07-04")).toBe("2026-07-04");
    expect(normalizeSignedUp("2026-07-04T12:00:00.000Z")).toBe("2026-07-04");
    expect(normalizeSignedUp("nope")).toBeUndefined();
  });

  it("defaults the audience", () => {
    expect(resolveAudienceId({})).toBe("e2c69d5d31");
  });

  it("hashes lowercase email for Mailchimp", () => {
    const expected = createHash("md5")
      .update("dan@gwenda.co.uk")
      .digest("hex");
    expect(mailchimpSubscriberHash("  Dan@Gwenda.co.uk ")).toBe(expected);
  });

  it("authorizes bearer secret", () => {
    const ok = new Request("https://example.com/", {
      headers: { Authorization: "Bearer sync-secret" },
    });
    const bad = new Request("https://example.com/", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(isAuthorized(ok, env)).toBe(true);
    expect(isAuthorized(bad, env)).toBe(false);
  });

  it("detects rate limits", () => {
    expect(isRateLimited(429, "")).toBe(true);
    expect(isRateLimited(400, "too many requests")).toBe(true);
    expect(isRateLimited(500, "boom")).toBe(false);
  });
});

describe("upsertMailchimpMember", () => {
  it("puts a new member then applies all tags", async () => {
    const hash = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/members/${hash}`) && !init?.method) {
        return new Response("{}", { status: 404 });
      }
      if (url.endsWith(`/members/${hash}`) && init?.method === "PUT") {
        expect(JSON.parse(String(init.body))).toEqual({
          email_address: "a@example.com",
          status_if_new: "subscribed",
          status: "subscribed",
          merge_fields: { [SIGNED_UP_MERGE_TAG]: "2026-07-04" },
        });
        return new Response("{}", { status: 200 });
      }
      if (url.endsWith(`/members/${hash}/tags`) && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          tags: [
            { name: "prelaunch", status: "active" },
            { name: "wifi", status: "active" },
          ],
        });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });

    const result = await upsertMailchimpMember({
      apiKey: "mailchimp-key-us2",
      audienceId: "e2c69d5d31",
      email: "a@example.com",
      tags: ["prelaunch", "wifi"],
      signedUp: "2026-07-04",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true });
  });

  it("skips ESP update for unsubscribed members", async () => {
    const hash = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/members/${hash}`) && !init?.method) {
        return Response.json({ status: "unsubscribed" });
      }
      throw new Error(`Unexpected mutating fetch: ${url}`);
    });

    const result = await upsertMailchimpMember({
      apiKey: "mailchimp-key-us2",
      audienceId: "e2c69d5d31",
      email: "a@example.com",
      tags: ["prelaunch"],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true, skippedEspUpdate: true });
  });

  it("counts an address Mailchimp rejects for good as done, so it isn't retried", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return new Response("", { status: 404 });
      return Response.json(
        {
          title: "Invalid Resource",
          status: 400,
          detail: "test@test.com looks fake or invalid, please enter a real email address.",
        },
        { status: 400 },
      );
    });

    const result = await upsertMailchimpMember({
      apiKey: "mailchimp-key-us2",
      audienceId: "e2c69d5d31",
      email: "test@test.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      rejected: "test@test.com looks fake or invalid, please enter a real email address.",
    });
  });

  it("still fails, to retry, on other Mailchimp errors", () => {
    expect(permanentRejection(400, '{"title":"Member Exists"}')).toBe("");
    expect(permanentRejection(500, '{"title":"Invalid Resource"}')).toBe("");
    expect(permanentRejection(400, "not json")).toBe("");
  });
});

describe("syncUnsyncedSubscribers", () => {
  /** Subscribers in memory, with these records (ids kept). */
  async function subscribers(records: Array<Partial<SubscriberRecord> & { id: number }>) {
    const repository = memorySubscriberRepository();
    await repository.importAll({
      subscribers: records.map((record) => ({
        email: "",
        tags: [],
        signedUpOn: null,
        synced: false,
        ...record,
      })),
    });
    return repository;
  }

  it("skips the run while guests are frozen for the move to D1 (#191)", async () => {
    const fetchImpl = vi.fn();
    const repository = await subscribers([{ id: 7, email: "a@example.com" }]);
    const listUnsynced = vi.spyOn(repository, "listUnsynced");
    const frozenDb = {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [{ key: "write_freeze:guests" }] }) }),
      }),
    };
    const summary = await syncUnsyncedSubscribers(
      { ...env, WEBSITE_DB: frozenDb },
      { fetchImpl: fetchImpl as unknown as typeof fetch, repository },
    );
    expect(summary).toMatchObject({ ok: true, frozen: true, scanned: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(listUnsynced).not.toHaveBeenCalled();
  });

  it("dry-run does not call Mailchimp or mark anything synced", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    const repository = await subscribers([
      { id: 7, email: "a@example.com", tags: ["prelaunch"] },
    ]);

    const summary = await syncUnsyncedSubscribers(env, {
      dryRun: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repository,
    });

    expect(summary.ok).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.synced).toBe(1);
    expect(summary.results[0]?.status).toBe("dry-run");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await repository.listUnsynced()).map((r) => r.id)).toEqual([7]);
  });

  it("upserts in Mailchimp with the tags and sign-up date, then marks the subscriber synced", async () => {
    const hash = mailchimpSubscriberHash("a@example.com");
    const puts: unknown[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(`/members/${hash}`) && !init?.method) {
        return new Response("{}", { status: 404 });
      }
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return new Response("{}", { status: 200 });
      }
      if (init?.method === "POST") return new Response(null, { status: 204 });
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });
    const repository = await subscribers([
      { id: 7, email: "a@example.com", tags: ["prelaunch"], signedUpOn: "2026-07-04" },
      { id: 8, email: "done@example.com", synced: true },
    ]);

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repository,
    });

    expect(summary.ok).toBe(true);
    expect(summary.synced).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.results[0]?.status).toBe("synced");
    expect(puts[0]).toMatchObject({ merge_fields: { [SIGNED_UP_MERGE_TAG]: "2026-07-04" } });
    expect(await repository.listUnsynced()).toEqual([]);
  });

  it("never sends the deploy smoke test's sign-up to Mailchimp", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      throw new Error(`Unexpected Mailchimp call: ${String(input)}`);
    });
    const repository = await subscribers([
      { id: 9, email: "Alerts+Signup-Smoke@gwenda.co.uk", tags: ["prelaunch"] },
    ]);

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repository,
    });

    expect(summary).toMatchObject({ ok: true, synced: 0, errors: 0 });
    expect(summary.results[0]).toMatchObject({ rowId: 9, status: "skipped", detail: "Smoke test" });
    expect((await repository.listUnsynced()).map((r) => r.id)).toEqual([9]);
  });

  it("stops early when Mailchimp rate-limits", async () => {
    let mailchimpPuts = 0;
    const hashA = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/members/${hashA}`) && !init?.method) {
        return new Response("{}", { status: 404 });
      }
      if (init?.method === "PUT") {
        mailchimpPuts += 1;
        return new Response(
          JSON.stringify({ title: "Too Many Requests" }),
          { status: 429 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const repository = await subscribers([
      { id: 1, email: "a@example.com" },
      { id: 2, email: "b@example.com" },
    ]);

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repository,
    });

    expect(mailchimpPuts).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.status).toBe("error");
  });
});
