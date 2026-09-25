import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

const siteSrc = resolve(import.meta.dirname, "../src");
const pagesOrigin = "http://127.0.0.1:8788";

// TODO: Reverse this. Vite currently proxies /api and HTML tools to Wrangler;
// Wrangler still serves its own built SPA. Prefer :8788 proxying the shell
// back to this Vite server so local UI is only the live HMR app.

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
      "/stock": pagesProxy(),
      "/breakeven": pagesProxy(),
      "/cashflow": pagesProxy(),
      "/favicon.ico": pagesProxy(),
      "/favicon.png": pagesProxy(),
      "/apple-touch-icon.png": pagesProxy(),
    },
  },
  build: {
    outDir: siteSrc,
    emptyOutDir: false,
    assetsDir: "_app",
    sourcemap: true,
  },
});
