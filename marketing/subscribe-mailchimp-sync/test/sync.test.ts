import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { memorySubscriberRepository } from "../../../shared/guests/adapters/memory-subscribers.js";
import { subscribe, type SubscriberRecord } from "../../../shared/guests/subscribers.js";
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
import { fakeMailchimp } from "./fake-mailchimp";

const env: Env = {
  MAILCHIMP_API_KEY: "mailchimp-key-us2",
  SYNC_SECRET: "sync-secret",
  MAILCHIMP_AUDIENCE_ID: "e2c69d5d31",
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

  it("puts a member who unsubscribed back as pending, so Mailchimp asks them to confirm", async () => {
    const mailchimp = fakeMailchimp();
    mailchimp.add({ email_address: "a@example.com", status: "unsubscribed" });

    const result = await upsertMailchimpMember({
      apiKey: "mailchimp-key-us2",
      audienceId: "e2c69d5d31",
      email: "a@example.com",
      tags: ["prelaunch"],
      fetchImpl: mailchimp.fetch,
    });

    expect(result).toEqual({ ok: true, confirming: true });
    expect(mailchimp.member("a@example.com")).toMatchObject({
      status: "pending",
      tags: ["prelaunch"],
    });
  });

  it("leaves a pending member pending", async () => {
    const mailchimp = fakeMailchimp();
    mailchimp.add({ email_address: "a@example.com", status: "pending" });
    await upsertMailchimpMember({
      apiKey: "mailchimp-key-us2",
      audienceId: "e2c69d5d31",
      email: "a@example.com",
      fetchImpl: mailchimp.fetch,
    });
    expect(mailchimp.puts[0]?.body).not.toHaveProperty("status");
    expect(mailchimp.member("a@example.com")?.status).toBe("pending");
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
    expect(permanentRejection(400, '{"title":"Member In Compliance State","detail":"x"}')).toBe("x");
    expect(permanentRejection(400, '{"title":"Forgotten Email Not Subscribed","detail":"y"}')).toBe("y");
  });
});

const noUnsubscribes = () => Response.json({ members: [], total_items: 0 });

describe("syncUnsyncedSubscribers", () => {
  /** Subscribers in memory, with these records (ids kept). */
  async function subscribers(records: Array<Partial<SubscriberRecord> & { id: number }>) {
    const repository = memorySubscriberRepository();
    await repository.importAll({
      subscribers: records.map((record) => ({
        email: "",
        tags: [],
        signedUpOn: null,
        marketing: true,
        marketingOn: null,
        marketingOffOn: null,
        lastSeenOn: null,
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
      if (url.includes("/members?status=unsubscribed")) return noUnsubscribes();
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

  it("never sends a Wi-Fi guest who left the newsletter box unticked", async () => {
    const mailchimp = fakeMailchimp();
    const fetchImpl = vi.fn(mailchimp.fetch);
    const repository = memorySubscriberRepository();
    // The Wi-Fi portal's save for a guest who didn't tick the box.
    await subscribe(repository, {
      email: "guest@example.com",
      tag: "wifi",
      marketing: false,
      visit: true,
    });

    for (const all of [false, true]) {
      const summary = await syncUnsyncedSubscribers(env, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        repository,
        all,
      });
      expect(summary).toMatchObject({ ok: true, scanned: 0, synced: 0 });
    }
    expect(mailchimp.puts).toEqual([]);
  });

  it("never sends the deploy smoke test's sign-up to Mailchimp", async () => {
    const mailchimp = fakeMailchimp();
    const fetchImpl = vi.fn(mailchimp.fetch);
    const repository = await subscribers([
      { id: 9, email: "Alerts+Signup-Smoke@gwenda.co.uk", tags: ["prelaunch"] },
    ]);

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      repository,
    });

    expect(summary).toMatchObject({ ok: true, synced: 0, errors: 0 });
    expect(summary.results[0]).toMatchObject({ rowId: 9, status: "skipped", detail: "Smoke test" });
    expect(mailchimp.puts).toEqual([]);
    expect((await repository.listUnsynced()).map((r) => r.id)).toEqual([9]);
  });

  it("stops early when Mailchimp rate-limits", async () => {
    let mailchimpPuts = 0;
    const hashA = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/members?status=unsubscribed")) return noUnsubscribes();
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

describe("unsubscribes and joining again", () => {
  const sync = (mailchimp: ReturnType<typeof fakeMailchimp>, repository: ReturnType<typeof memorySubscriberRepository>, options = {}) =>
    syncUnsyncedSubscribers(env, { fetchImpl: mailchimp.fetch, repository, ...options });

  /** Ada signed up on the website, was synced, then unsubscribed in Mailchimp on 10 November. */
  async function unsubscribedAda() {
    const mailchimp = fakeMailchimp();
    const repository = memorySubscriberRepository();
    await subscribe(repository, {
      email: "ada@example.com",
      tag: "website",
      now: new Date("2026-10-01T12:00:00Z"),
    });
    await sync(mailchimp, repository);
    expect(mailchimp.member("ada@example.com")?.status).toBe("subscribed");
    mailchimp.add({
      ...mailchimp.member("ada@example.com")!,
      status: "unsubscribed",
      last_changed: "2026-11-10T09:30:00+00:00",
    });
    mailchimp.puts.length = 0;
    return { mailchimp, repository };
  }

  const ada = async (repository: ReturnType<typeof memorySubscriberRepository>) =>
    (await repository.listByEmail("ada@example.com"))[0];

  it("an unsubscribe in Mailchimp takes the address off our list", async () => {
    const { mailchimp, repository } = await unsubscribedAda();
    const summary = await sync(mailchimp, repository);

    expect(summary).toMatchObject({ ok: true, unsubscribed: 1 });
    expect(await ada(repository)).toMatchObject({
      marketing: false,
      marketingOffOn: "2026-11-10",
      marketingOn: "2026-10-01",
    });
    expect(mailchimp.puts).toEqual([]);

    // The next run asks only for unsubscribes since the latest one it has.
    await sync(mailchimp, repository);
    expect(mailchimp.listQueries.at(-1)?.get("since_last_changed")).toBe(
      "2026-11-10T00:00:00+00:00",
    );
  });

  it("reads every page of unsubscribes", async () => {
    const mailchimp = fakeMailchimp();
    const repository = memorySubscriberRepository();
    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      await subscribe(repository, { email, tag: "website" });
      mailchimp.add({ email_address: email, status: "unsubscribed" });
    }
    for (const record of await repository.listUnsynced({ limit: 10 }))
      await repository.update(record.id, { synced: true });

    const summary = await sync(mailchimp, repository, { pageSize: 2 });

    expect(summary).toMatchObject({ ok: true, unsubscribed: 3 });
    expect(await repository.listUnsynced({ all: true })).toEqual([]);
  });

  it("signing up again on the website after unsubscribing asks Mailchimp to confirm", async () => {
    const { mailchimp, repository } = await unsubscribedAda();
    await sync(mailchimp, repository);

    await subscribe(repository, {
      email: "ada@example.com",
      tag: "website",
      now: new Date("2026-11-18T12:00:00Z"),
    });
    const summary = await sync(mailchimp, repository);

    expect(summary).toMatchObject({ ok: true, synced: 1 });
    expect(mailchimp.puts.map((put) => put.body.status)).toEqual(["pending"]);
    expect(mailchimp.member("ada@example.com")?.status).toBe("pending");
    expect(await ada(repository)).toMatchObject({
      marketing: true,
      marketingOn: "2026-11-18",
      marketingOffOn: null,
      synced: true,
    });

    // Waiting for them to confirm isn't an unsubscribe.
    await sync(mailchimp, repository);
    expect((await ada(repository)).marketing).toBe(true);
  });

  it("a Wi-Fi visit with the box unticked after unsubscribing sends nothing", async () => {
    const { mailchimp, repository } = await unsubscribedAda();
    await sync(mailchimp, repository);

    await subscribe(repository, {
      email: "ada@example.com",
      tag: "wifi",
      marketing: false,
      visit: true,
    });
    await sync(mailchimp, repository);

    expect(mailchimp.puts).toEqual([]);
    expect(mailchimp.member("ada@example.com")?.status).toBe("unsubscribed");
    expect((await ada(repository)).marketing).toBe(false);
  });

  it.each(["cleaned", "archived"] as const)(
    "never re-adds a %s member, and doesn't retry",
    async (status) => {
      const mailchimp = fakeMailchimp();
      const repository = memorySubscriberRepository();
      mailchimp.add({ email_address: "ada@example.com", status });
      await subscribe(repository, { email: "ada@example.com", tag: "website" });

      const summary = await sync(mailchimp, repository);

      expect(mailchimp.puts).toEqual([]);
      expect(summary.results[0]).toMatchObject({
        status: "synced",
        detail: `Mailchimp member is ${status}; not re-added`,
      });
      expect(await repository.listUnsynced()).toEqual([]);
      expect((await ada(repository)).marketing).toBe(true);
    },
  );
});
