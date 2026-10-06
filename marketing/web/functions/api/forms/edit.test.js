import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseFormEditToken } = vi.hoisted(() => ({
  parseFormEditToken: vi.fn(),
}));
const { fetchFormSubmission, draftAnswersFromSubmission } = vi.hoisted(() => ({
  fetchFormSubmission: vi.fn(),
  draftAnswersFromSubmission: vi.fn(),
}));

vi.mock("../../_lib/form-verify-auth.js", () => ({
  parseFormEditToken,
}));
vi.mock("../../_lib/form-store.js", () => ({
  fetchFormSubmission,
  draftAnswersFromSubmission,
}));
vi.mock("../../_lib/form-paths.js", () => ({
  formPublicPath: (slug) => `/contact/${slug}`,
}));

import { onRequestGet } from "./edit.js";

describe("GET /api/forms/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns draft answers for a valid token", async () => {
    parseFormEditToken.mockResolvedValue({
      ok: true,
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    fetchFormSubmission.mockResolvedValue({
      ok: true,
      submission: { replyTo: "alex@example.com", formSlug: "play" },
    });
    draftAnswersFromSubmission.mockReturnValue({
      name: "Alex",
      email: "alex@example.com",
    });

    const res = await onRequestGet({
      request: new Request("https://gwenda.co.uk/api/forms/edit?t=abc"),
      env: {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      formPath: "/contact/play",
      draftAnswers: { name: "Alex", email: "alex@example.com" },
      email: "alex@example.com",
    });
  });

  it("rejects invalid tokens", async () => {
    parseFormEditToken.mockResolvedValue({
      ok: false,
      reason: "invalid",
      slug: "play",
    });

    const res = await onRequestGet({
      request: new Request("https://gwenda.co.uk/api/forms/edit?t=bad"),
      env: {},
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.formPath).toBe("/contact/play");
  });

  it("rejects email mismatch", async () => {
    parseFormEditToken.mockResolvedValue({
      ok: true,
      rowId: "501",
      email: "alex@example.com",
      slug: "play",
    });
    fetchFormSubmission.mockResolvedValue({
      ok: true,
      submission: { replyTo: "other@example.com", formSlug: "play" },
    });

    const res = await onRequestGet({
      request: new Request("https://gwenda.co.uk/api/forms/edit?t=abc"),
      env: {},
    });
    expect(res.status).toBe(400);
  });
});
