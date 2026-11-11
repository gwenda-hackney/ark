import type { APIRoute } from "astro";
import { webManifest } from "../lib/web-manifest";

/** /site.webmanifest, built with the site (see src/lib/web-manifest.ts). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(webManifest(), null, 2), {
    headers: { "Content-Type": "application/manifest+json" },
  });
