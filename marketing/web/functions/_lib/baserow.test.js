import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearBaserowTableIdCache,
  FORM_SUBMISSIONS_TABLE_NAME,
  resolveRsvpTableId,
  RSVP_TABLE_NAME,
  SUBSCRIBE_TABLE_NAME,
  WEBSITE_DATABASE_NAME,
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
          { id: 99, name: SUBSCRIBE_TABLE_NAME, database_id: 1 },
          { id: 42, name: RSVP_TABLE_NAME, database_id: 1 },
        ],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result).toEqual({ ok: true, tableId: "42" });
  });

  it("errors when the token can see more than one table with that name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1, name: RSVP_TABLE_NAME, database_id: 111 },
          { id: 2, name: RSVP_TABLE_NAME, database_id: 222 },
        ],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(WEBSITE_DATABASE_NAME);
  });

  it("filters by BASEROW_DATABASE_ID when set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 1, name: RSVP_TABLE_NAME, database_id: 111 },
          { id: 2, name: RSVP_TABLE_NAME, database_id: 222 },
        ],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
      BASEROW_DATABASE_ID: "222",
    });

    expect(result).toEqual({ ok: true, tableId: "2" });
  });

  it("returns an error when the table is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ id: 99, name: "Other", database_id: 1 }],
      })),
    );

    const result = await resolveRsvpTableId({
      BASEROW_API_KEY: "test-token",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(RSVP_TABLE_NAME);
  });
});
