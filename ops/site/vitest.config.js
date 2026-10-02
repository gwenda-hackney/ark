import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Compiles runes ($state, $derived) in *.svelte.ts modules under test.
  plugins: [svelte()],
  test: {
    name: "ops",
    include: ["functions/**/*.test.js", "src/**/*.test.{js,ts}"],
  },
});
