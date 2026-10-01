import { defineConfig } from "vitest/config";

// Its own config, so `npm test` here doesn't pick up the root one (whose
// project paths only resolve from the repo root). The root lists this folder.
export default defineConfig({ test: { name: "site-health" } });
