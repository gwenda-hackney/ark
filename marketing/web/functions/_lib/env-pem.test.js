import { describe, expect, it } from "vitest";
import { parseDotEnv, pickPemValue } from "./env-pem.js";

describe("parseDotEnv", () => {
  it("reads multiline quoted values", () => {
    const entries = parseDotEnv(`FOO=bar
CERT="-----BEGIN CERTIFICATE-----
line2
-----END CERTIFICATE-----"
BAZ=1`);
    expect(entries).toEqual([
      ["FOO", "bar"],
      ["CERT", "-----BEGIN CERTIFICATE-----\nline2\n-----END CERTIFICATE-----"],
      ["BAZ", "1"],
    ]);
  });
});

describe("pickPemValue", () => {
  it("prefers a complete PEM from loadEnv over a truncated process env", () => {
    const loaded =
      "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
    expect(pickPemValue("-----BEGIN CERTIFICATE-----", loaded)).toBe(loaded);
  });

  it("keeps a complete process env value when present", () => {
    const processValue =
      "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    expect(pickPemValue(processValue, "other")).toBe(processValue);
  });
});
