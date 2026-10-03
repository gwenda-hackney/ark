import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  clearSubscribeTableIdCache,
  isAuthorized,
  isRateLimited,
  listUnsyncedRows,
  mailchimpSubscriberHash,
  normalizeEmail,
  normalizeSignedUp,
  normalizeTag,
  normalizeTags,
  permanentRejection,
  resolveAudienceId,
  resolveTableId,
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

  it("normalizes tags and signed-up dates", () => {
    expect(normalizeTag("prelaunch")).toBe("prelaunch");
    expect(normalizeTag({ value: "prelaunch" })).toBe("prelaunch");
    expect(normalizeTag({})).toBeUndefined();
    expect(normalizeTags("prelaunch")).toEqual(["prelaunch"]);
    expect(normalizeTags([{ value: "prelaunch" }, { value: "wifi" }])).toEqual([
      "prelaunch",
      "wifi",
    ]);
    expect(normalizeTags(["prelaunch", "wifi", "prelaunch"])).toEqual([
      "prelaunch",
      "wifi",
    ]);
    expect(normalizeSignedUp("2026-07-04")).toBe("2026-07-04");
    expect(normalizeSignedUp("2026-07-04T12:00:00.000Z")).toBe("2026-07-04");
    expect(normalizeSignedUp("nope")).toBeUndefined();
  });

  it("resolves Subscribers by name and defaults the audience", async () => {
    clearSubscribeTableIdCache();
    expect(resolveAudienceId({})).toBe("e2c69d5d31");

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: 1017358, name: "Subscribers", database_id: 461843 },
      ],
    })) as unknown as typeof fetch;

    await expect(
      resolveTableId({ BASEROW_API_KEY: "k" }, fetchImpl),
    ).resolves.toBe("1017358");
  });

  it("errors when the token can see more than one Subscribers table", async () => {
    clearSubscribeTableIdCache();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: 1017358, name: "Subscribers", database_id: 461843 },
        { id: 1024006, name: "Subscribers", database_id: 563090 },
      ],
    })) as unknown as typeof fetch;

    await expect(
      resolveTableId({ BASEROW_API_KEY: "k" }, fetchImpl),
    ).rejects.toThrow(/Website database/);
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

describe("listUnsyncedRows", () => {
  it("can list all rows when all=true", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).not.toContain("filter__Synced__boolean");
      expect(url).toContain("size=100");
      return Response.json({
        results: [{ id: 1, Email: "a@example.com", Synced: true }],
      });
    });

    const rows = await listUnsyncedRows({
      apiKey: "k",
      apiBase: "https://api.baserow.io",
      tableId: "1017358",
      limit: 100,
      all: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(rows).toHaveLength(1);
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
  function tablesResponse() {
    return Response.json([
      { id: 1017358, name: "Subscribers", database_id: 461843 },
    ]);
  }

  it("dry-run does not call Mailchimp or patch Baserow", async () => {
    clearSubscribeTableIdCache();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("api.mailchimp.com") || init?.method === "PATCH") {
        throw new Error(`Unexpected mutating fetch: ${url}`);
      }
      if (url.includes("/all-tables/")) return tablesResponse();
      if (url.includes("/rows/table/")) {
        return Response.json({
          results: [
            { id: 7, Email: "a@example.com", Tag: "prelaunch", Synced: false },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const summary = await syncUnsyncedSubscribers(env, {
      dryRun: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary.ok).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.synced).toBe(1);
    expect(summary.results[0]?.status).toBe("dry-run");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("upserts in Mailchimp then marks Baserow Synced", async () => {
    clearSubscribeTableIdCache();
    const hash = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/all-tables/")) return tablesResponse();
      if (url.includes("api.baserow.io") && init?.method !== "PATCH") {
        return Response.json({
          results: [
            { id: 7, Email: "a@example.com", Tag: "prelaunch", Synced: false },
          ],
        });
      }
      if (url.includes("api.mailchimp.com") && url.endsWith(`/members/${hash}`) && !init?.method) {
        return new Response("{}", { status: 404 });
      }
      if (url.includes("api.mailchimp.com") && init?.method === "PUT") {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("api.mailchimp.com") && init?.method === "POST") {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/7/") && init?.method === "PATCH") {
        expect(JSON.parse(String(init.body))).toEqual({ Synced: true });
        return new Response("{}", { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary.ok).toBe(true);
    expect(summary.synced).toBe(1);
    expect(summary.errors).toBe(0);
    expect(summary.results[0]?.status).toBe("synced");
  });

  it("stops early when Mailchimp rate-limits", async () => {
    clearSubscribeTableIdCache();
    let mailchimpPuts = 0;
    const hashA = mailchimpSubscriberHash("a@example.com");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/all-tables/")) return tablesResponse();
      if (url.includes("api.baserow.io") && init?.method !== "PATCH") {
        return Response.json({
          results: [
            { id: 1, Email: "a@example.com", Synced: false },
            { id: 2, Email: "b@example.com", Synced: false },
          ],
        });
      }
      if (url.includes("api.mailchimp.com") && url.includes(`/members/${hashA}`) && !init?.method) {
        return new Response("{}", { status: 404 });
      }
      if (url.includes("api.mailchimp.com") && init?.method === "PUT") {
        mailchimpPuts += 1;
        return new Response(
          JSON.stringify({ title: "Too Many Requests" }),
          { status: 429 },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const summary = await syncUnsyncedSubscribers(env, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(mailchimpPuts).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.status).toBe("error");
  });
});
