import { describe, expect, it } from "vitest";
import {
  SERVICE,
  createLogger,
  createStdoutSink,
  requestFields,
  serializeError,
} from "./log.js";

describe("serializeError", () => {
  it("keeps name, message, status, and stack", () => {
    const error = new Error("Baserow 429: Request was throttled.");
    error.status = 429;
    const fields = serializeError(error);
    expect(fields.name).toBe("Error");
    expect(fields.message).toBe("Baserow 429: Request was throttled.");
    expect(fields.status).toBe(429);
    expect(typeof fields.stack).toBe("string");
  });

  it("stringifies non-objects", () => {
    expect(serializeError("nope")).toEqual({ message: "nope" });
  });
});

describe("requestFields", () => {
  it("reads method and path, not the query string", () => {
    const request = new Request("https://gwenda.co.uk/api/forms?slug=play");
    expect(requestFields(request)).toEqual({
      method: "GET",
      path: "/api/forms",
      ray: undefined,
      colo: undefined,
    });
  });

  it("reads cf-ray when present", () => {
    const request = new Request("https://gwenda.co.uk/api/forms", {
      headers: { "cf-ray": "abc123-LHR" },
    });
    expect(requestFields(request).ray).toBe("abc123-LHR");
  });
});

describe("createLogger", () => {
  it("writes structured records with service and event", () => {
    const records = [];
    const log = createLogger({
      write: (record) => records.push(record),
      fields: { path: "/api/forms" },
    });
    log.event("error", "form_store_failed", { status: 502 });
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe("error");
    expect(records[0].service).toBe(SERVICE);
    expect(records[0].message).toBe("form_store_failed");
    expect(records[0].event).toBe("form_store_failed");
    expect(records[0].path).toBe("/api/forms");
    expect(records[0].status).toBe(502);
    expect(typeof records[0].ts).toBe("string");
  });

  it("does not throw when the sink fails", () => {
    const log = createLogger({
      write() {
        throw new Error("sink down");
      },
    });
    log.error("form_store_failed");
  });
});

describe("createStdoutSink", () => {
  it("writes JSON lines to console.error for errors", () => {
    const lines = [];
    const sink = createStdoutSink({
      log() {},
      warn() {},
      error(line) {
        lines.push(line);
      },
    });
    sink({ level: "error", event: "form_store_failed" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: "error",
      event: "form_store_failed",
    });
  });
});
