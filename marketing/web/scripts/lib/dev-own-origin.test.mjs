import { describe, expect, it } from "vitest";
import { devOwnOrigin } from "./dev-own-origin.mjs";

describe("devOwnOrigin", () => {
  it("is the port the server listens on, not the one the browser used", () => {
    // The browser said Host: localhost:4322 (a forwarded port); the server
    // is on 4321 inside the container.
    expect(
      devOwnOrigin({ address: "0.0.0.0", family: "IPv4", port: 4321 }),
    ).toBe("http://127.0.0.1:4321");
  });

  it("uses the address the server is bound to", () => {
    expect(devOwnOrigin({ address: "127.0.0.1", port: 5000 })).toBe(
      "http://127.0.0.1:5000",
    );
    expect(devOwnOrigin({ address: "::1", port: 5000 })).toBe(
      "http://[::1]:5000",
    );
    expect(devOwnOrigin({ address: "::", port: 5000 })).toBe(
      "http://localhost:5000",
    );
  });

  it("falls back to the port asked for before the server is up", () => {
    expect(devOwnOrigin(null, 4321)).toBe("http://127.0.0.1:4321");
  });
});
