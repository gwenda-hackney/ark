import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCoalescer } from "./coalesce.ts";

describe("createCoalescer", () => {
  it("reuses an in-flight promise for the same key", async () => {
    const coalesce = createCoalescer();
    let starts = 0;
    let release: (value: string) => void = () => undefined;
    const run = () => {
      starts += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };
    const first = coalesce("menu", run);
    const second = coalesce("menu", run);
    assert.equal(starts, 1);
    release("ok");
    assert.equal(await first, "ok");
    assert.equal(await second, "ok");
    assert.equal(await coalesce("menu", async () => "later"), "later");
    assert.equal(starts, 1);
  });

  it("does not share different keys", async () => {
    const coalesce = createCoalescer();
    const a = coalesce("menu", async () => "m");
    const b = coalesce("inventory", async () => "i");
    assert.deepEqual(await Promise.all([a, b]), ["m", "i"]);
  });
});
