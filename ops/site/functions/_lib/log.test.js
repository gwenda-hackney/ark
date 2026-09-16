import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLogger,
  createStdoutSink,
  loggerFromContext,
  requestFields,
  serializeError,
} from "./log.js";

describe("serializeError", () => {
  it("keeps name, message, status, and stack", () => {
    const error = new Error("Baserow 429: Request was throttled.");
    error.status = 429;
    const fields = serializeError(error);
    assert.equal(fields.name, "Error");
    assert.equal(fields.message, "Baserow 429: Request was throttled.");
    assert.equal(fields.status, 429);
    assert.equal(typeof fields.stack, "string");
  });

  it("stringifies non-objects", () => {
    assert.deepEqual(serializeError("nope"), { message: "nope" });
  });
});

describe("requestFields", () => {
  it("reads method and path, not the query string", () => {
    const request = new Request("https://ops.example/api/menu?access=secret");
    assert.deepEqual(requestFields(request), {
      method: "GET",
      path: "/api/menu",
      ray: undefined,
      colo: undefined,
    });
  });

  it("reads cf-ray when present", () => {
    const request = new Request("https://ops.example/api/inventory", {
      headers: { "cf-ray": "abc123-LHR" },
    });
    assert.equal(requestFields(request).ray, "abc123-LHR");
  });
});

describe("createLogger", () => {
  it("writes structured records through the sink", () => {
    const records = [];
    const log = createLogger({
      write: (record) => records.push(record),
      fields: { path: "/api/menu" },
    });
    log.error("api.error", { status: 500 });
    assert.equal(records.length, 1);
    assert.equal(records[0].level, "error");
    assert.equal(records[0].service, "gwenda-ops");
    assert.equal(records[0].message, "api.error");
    assert.equal(records[0].path, "/api/menu");
    assert.equal(records[0].status, 500);
    assert.equal(typeof records[0].ts, "string");
  });

  it("child loggers inherit fields", () => {
    const records = [];
    const log = createLogger({ write: (record) => records.push(record) });
    log.child({ path: "/api/inventory" }).info("api.request", { status: 200 });
    assert.equal(records[0].path, "/api/inventory");
    assert.equal(records[0].status, 200);
  });

  it("does not throw when the sink fails", () => {
    const log = createLogger({
      write() {
        throw new Error("sink down");
      },
    });
    log.error("api.error");
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
    sink({ level: "error", message: "api.error" });
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), { level: "error", message: "api.error" });
  });
});

describe("loggerFromContext", () => {
  it("reuses context.log when already attached", () => {
    const records = [];
    const log = createLogger({ write: (record) => records.push(record) });
    const reused = loggerFromContext({ log });
    reused.info("hello");
    assert.equal(reused, log);
    assert.equal(records[0].message, "hello");
  });
});
