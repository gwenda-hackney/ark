import { describe, expect, it } from "vitest";
import { hostsWithRule } from "./ensure-web-analytics-lib.mjs";

describe("hostsWithRule", () => {
  it("lists hosts covered by include or exclude rules", () => {
    const rules = [
      { host: "staging.gwenda.co.uk", inclusive: false, is_paused: false },
      { host: "www.gwenda.co.uk", inclusive: true, is_paused: false },
      { host: "staging.gwenda.co.uk", inclusive: true, is_paused: true },
    ];

    expect([...hostsWithRule(rules, false)]).toEqual(["staging.gwenda.co.uk"]);
    expect([...hostsWithRule(rules, true)]).toEqual(["www.gwenda.co.uk"]);
  });
});
