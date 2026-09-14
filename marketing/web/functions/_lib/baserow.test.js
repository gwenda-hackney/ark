import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRsvpTableIdCache,
  resolveRsvpTableId,
  RSVP_TABLE_NAME,
} from "./baserow.js";

describe("resolveRsvpTableId", () => {
  afterEach(() => {
    clearRsvpTableIdCache();
    vi.unstubAllGlobals();
  });

  it("finds the RSVP table by name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 99, name: "Subscribers", database_id: 465058 },
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
