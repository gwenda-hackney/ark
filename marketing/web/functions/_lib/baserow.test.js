import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBaserowTableIdCache,
  FORM_SUBMISSIONS_TABLE_NAME,
  resolveFormSubmissionsTableId,
  resolveRsvpTableId,
  resolveSubscribeTableId,
  RSVP_TABLE_NAME,
  SUBSCRIBE_TABLE_NAME,
} from "./baserow.js";

describe("resolveRsvpTableId", () => {
  afterEach(() => {
    clearBaserowTableIdCache();
    vi.unstubAllGlobals();
  });

  it("finds the RSVP table by name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 99, name: SUBSCRIBE_TABLE_NAME, database_id: 465058 },
          { id: 42, name: RSVP_TABLE_NAME, database_id: 465058 },
        ],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result).toEqual({ ok: true, tableId: "42" });
  });

  it("filters by dev database id by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1, name: RSVP_TABLE_NAME, database_id: 111 },
          { id: 2, name: RSVP_TABLE_NAME, database_id: 465058 },
        ],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result).toEqual({ ok: true, tableId: "2" });
  });

  it("returns an error when the table is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 99, name: "Other", database_id: 465058 }],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(RSVP_TABLE_NAME);
  });
});

describe("resolveFormSubmissionsTableId", () => {
  afterEach(() => {
    clearBaserowTableIdCache();
    vi.unstubAllGlobals();
  });

  it("finds Form Submissions by name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 99, name: SUBSCRIBE_TABLE_NAME, database_id: 465058 },
          { id: 77, name: FORM_SUBMISSIONS_TABLE_NAME, database_id: 465058 },
        ],
      })),
    );

    const result = await resolveFormSubmissionsTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result).toEqual({ ok: true, tableId: "77" });
  });

  it("returns an error when the table is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 99, name: "Other", database_id: 465058 }],
      })),
    );

    const result = await resolveFormSubmissionsTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(FORM_SUBMISSIONS_TABLE_NAME);
    expect(result.error).toContain("setup:baserow-form-submissions");
  });
});

describe("resolveSubscribeTableId", () => {
  afterEach(() => {
    clearBaserowTableIdCache();
    vi.unstubAllGlobals();
  });

  it("finds Subscribers by name in the dev database", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1017358, name: SUBSCRIBE_TABLE_NAME, database_id: 461843 },
          { id: 1024006, name: SUBSCRIBE_TABLE_NAME, database_id: 465058 },
        ],
      })),
    );

    const result = await resolveSubscribeTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result).toEqual({ ok: true, tableId: "1024006" });
  });

  it("uses production database when SITE_ENV is production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1017358, name: SUBSCRIBE_TABLE_NAME, database_id: 461843 },
          { id: 1024006, name: SUBSCRIBE_TABLE_NAME, database_id: 465058 },
        ],
      })),
    );

    const result = await resolveSubscribeTableId({
      BASEROW_API_KEY: "test-token",
      SITE_ENV: "production",
    });

    expect(result).toEqual({ ok: true, tableId: "1017358" });
  });
});
