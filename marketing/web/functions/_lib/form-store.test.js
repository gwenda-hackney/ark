import { afterEach, describe, expect, it, vi } from "vitest";
import { clearBaserowTableIdCache, FORM_SUBMISSIONS_TABLE_NAME } from "./baserow.js";
import { findFormSubmissionByEmail, storeFormSubmission } from "./form-store.js";

describe("storeFormSubmission", () => {
  afterEach(() => {
    clearBaserowTableIdCache();
    vi.unstubAllGlobals();
  });

  it("POSTs a document row with metadata and JSON answers", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes("/all-tables/")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 77,
              name: FORM_SUBMISSIONS_TABLE_NAME,
              database_id: 465058,
            },
          ],
        };
      }

      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Token test-token");
      const body = JSON.parse(init.body);
      expect(body["Form Slug"]).toBe("play-at-gwenda");
      expect(body["Form Title"]).toBe("Play at Gwenda");
      expect(body["Reply To"]).toBe("alex@example.com");
      expect(body.Submitted).toBe("2026-09-17T12:00:00.000Z");
      expect(body.Status).toBe("Verified");
      expect(JSON.parse(body.Answers)).toEqual([
        { key: "name", label: "Name", value: "Alex" },
        { key: "email", label: "Email", value: "alex@example.com" },
      ]);

      return {
        ok: true,
        json: async () => ({ id: 501 }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await storeFormSubmission(
      { BASEROW_API_KEY: "test-token" },
      {
        form: { title: "Play at Gwenda", slug: "play-at-gwenda" },
        answers: [
          { key: "name", label: "Name", value: "Alex" },
          { key: "email", label: "Email", value: "alex@example.com" },
        ],
        submittedAt: "2026-09-17T12:00:00.000Z",
      },
    );

    expect(result).toEqual({ ok: true, rowId: "501", updated: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stores Pending when status is passed", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes("/all-tables/")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 77,
              name: FORM_SUBMISSIONS_TABLE_NAME,
              database_id: 465058,
            },
          ],
        };
      }
      const body = JSON.parse(init.body);
      expect(body.Status).toBe("Pending");
      return {
        ok: true,
        json: async () => ({ id: 502 }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await storeFormSubmission(
      { BASEROW_API_KEY: "test-token" },
      {
        form: { title: "Play", slug: "play-at-gwenda" },
        answers: [{ key: "email", label: "Email", value: "a@b.co" }],
        status: "Pending",
      },
    );
    expect(result).toEqual({ ok: true, rowId: "502", updated: false });
  });

  it("returns an error when Baserow is not configured", async () => {
    const result = await storeFormSubmission(
      {},
      {
        form: { title: "Play", slug: "play" },
        answers: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Baserow");
  });

  it("returns an error when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/all-tables/")) {
          return {
            ok: true,
            json: async () => [
              {
                id: 77,
                name: FORM_SUBMISSIONS_TABLE_NAME,
                database_id: 465058,
              },
            ],
          };
        }
        return {
          ok: false,
          status: 500,
          text: async () => "boom",
          json: async () => null,
        };
      }),
    );

    const result = await storeFormSubmission(
      { BASEROW_API_KEY: "test-token" },
      {
        form: { title: "Play", slug: "play" },
        answers: [{ key: "name", label: "Name", value: "Alex" }],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Could not save");
  });
});

describe("findFormSubmissionByEmail", () => {
  afterEach(() => {
    clearBaserowTableIdCache();
    vi.unstubAllGlobals();
  });

  it("returns the latest row for an email even when an older Verified duplicate exists", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/all-tables/")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 77,
              name: FORM_SUBMISSIONS_TABLE_NAME,
              database_id: 465058,
            },
          ],
        };
      }

      const href = String(url);
      expect(href).toContain("filter__Form+Slug__equal=play-at-gwenda");
      expect(href).not.toContain("filter__Reply");

      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: 14,
              Status: { value: "Pending" },
              "Form Slug": "play-at-gwenda",
              "Reply To": "Alex@Example.com",
              Submitted: "2026-09-17T18:00:00.000Z",
            },
            {
              id: 13,
              Status: { value: "Verified" },
              "Form Slug": "play-at-gwenda",
              "Reply To": "alex@example.com",
              Submitted: "2026-09-17T12:00:00.000Z",
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await findFormSubmissionByEmail(
      { BASEROW_API_KEY: "test-token" },
      { slug: "play-at-gwenda", email: "Alex@Example.com" },
    );

    expect(result.ok).toBe(true);
    expect(result.row?.id).toBe(14);
  });

  it("upserts an existing row by email instead of inserting", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes("/all-tables/")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 77,
              name: FORM_SUBMISSIONS_TABLE_NAME,
              database_id: 465058,
            },
          ],
        };
      }

      if (!init?.method || init.method === "GET") {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                id: 13,
                Status: { value: "Verified" },
                "Form Slug": "play-at-gwenda",
                "Reply To": "alex@example.com",
              },
            ],
          }),
        };
      }

      expect(init.method).toBe("PATCH");
      expect(String(url)).toContain("/13/");
      const body = JSON.parse(init.body);
      expect(body.Status).toBe("Pending");
      expect(body["Reply To"]).toBe("alex@example.com");
      expect(JSON.parse(body.Answers).raw.email).toBe("alex@example.com");

      return {
        ok: true,
        json: async () => ({ id: 13 }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const { upsertFormSubmission } = await import("./form-store.js");
    const result = await upsertFormSubmission(
      { BASEROW_API_KEY: "test-token" },
      {
        form: { title: "Play at Gwenda", slug: "play-at-gwenda" },
        answers: [
          { key: "name", label: "Name", value: "Alex" },
          { key: "email", label: "Email", value: "Alex@Example.com" },
        ],
        rawAnswers: { name: "Alex", email: "Alex@Example.com" },
        status: "Pending",
      },
    );

    expect(result).toEqual({ ok: true, rowId: "13", updated: true });
  });
});
