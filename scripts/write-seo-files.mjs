import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const domain = "https://gwenda.co.uk";
const isStaging = process.env.PUBLIC_IS_STAGING === "true";

/** Public pages that should appear in search indexes. */
const indexablePaths = ["/", "/privacy/"];

const robots = isStaging
  ? ["User-agent: *", "Disallow: /"].join("\n")
  : [
      "User-agent: *",
      "Allow: /",
      "Disallow: /gate/",
      "Disallow: /preview/",
      "Disallow: /thanks/",
      "Disallow: /api/",
      "",
      `Sitemap: ${domain}/sitemap.xml`,
    ].join("\n");

writeFileSync(resolve(distDir, "robots.txt"), `${robots}\n`);
console.log(
  `Wrote dist/robots.txt (${isStaging ? "staging — noindex" : "production"})`,
);

if (isStaging) {
  console.log("Skipping sitemap.xml on staging.");
  process.exit(0);
}

const lastmod = new Date().toISOString();

const urls = indexablePaths
  .map(
    (path) => `  <url>
    <loc>${domain}${path === "/" ? "/" : path}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
  )
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(resolve(distDir, "sitemap.xml"), sitemap);
console.log(`Wrote dist/sitemap.xml (${indexablePaths.length} URLs)`);
