import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

const pagesOrigin = "http://127.0.0.1:8788";

// Vite serves the app with HMR and proxies /api, the sign-in gate and the
// icons to Wrangler (Pages Functions) on :8788.

function rewritePagesLocation(location: string, host: string | undefined) {
  try {
    const incoming = `http://${host || "localhost:5174"}`;
    const url = new URL(location, incoming);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    /* keep original */
  }
  return location;
}

function pagesProxy() {
  return {
    target: pagesOrigin,
    changeOrigin: true,
    xfwd: true,
    autoRewrite: true,
    configure(proxy: { on: (event: string, fn: (...args: any[]) => void) => void }) {
      proxy.on("proxyRes", (proxyRes: { headers: { location?: string } }, req: { headers: { host?: string } }) => {
        const location = proxyRes.headers.location;
        if (typeof location !== "string") return;
        proxyRes.headers.location = rewritePagesLocation(
          location,
          req.headers.host,
        );
      });
    },
  };
}

export default defineConfig({
  base: "/",
  appType: "spa",
  plugins: [svelte()],
  root: resolve(import.meta.dirname),
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": pagesProxy(),
      "/gate": pagesProxy(),
      "/website-pass": pagesProxy(),
      "/favicon.ico": pagesProxy(),
      "/favicon.png": pagesProxy(),
      "/apple-touch-icon.png": pagesProxy(),
    },
  },
  // Static files (icons, robots.txt, the sign-in gate) come from public/.
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "_app",
    // Maps are uploaded to Sentry and deleted before deploy (#35): no
    // sourceMappingURL in the served files.
    sourcemap: "hidden",
  },
});
