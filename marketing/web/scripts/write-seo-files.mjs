import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const domain = "https://gwenda.co.uk";
const isStaging = process.env.PUBLIC_IS_STAGING === "true";

/** Public pages that should appear in search indexes. */
const indexablePaths = ["/", "/privacy/", "/events/", "/menu/"];

/** Well-known AI crawlers and browsing agents (explicit Allow in robots.txt). */
const AI_BOT_AGENTS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ChatGPT-User",
  "ClaudeBot",
  "CloudflareBrowserRenderingCrawler",
  "cohere-ai",
  "Diffbot",
  "DuckAssistBot",
  "Google-CloudVertexBot",
  "Google-Extended",
  "GoogleOther",
  "GPTBot",
  "meta-externalagent",
  "OAI-SearchBot",
  "PerplexityBot",
  "PetalBot",
  "anthropic-ai",
  "AI2Bot",
  "PhindBot",
  "TikTokSpider",
  "YouBot",
];

const DISALLOWED_PATHS = ["/gate/", "/preview/", "/thanks/", "/api/"];

function buildRobotsTxt({ includeSitemap }) {
  const signal = "Content-Signal: search=yes,ai-input=yes,ai-train=yes";
  const agentBlock = (agent) => [
    `User-agent: ${agent}`,
    signal,
    "Allow: /",
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    "",
  ];

  const lines = [
    "# Gwenda — search and AI crawlers welcome",
    "# Explicit Google-Extended allow (clears prior Cloudflare opt-out for Gemini).",
    ...agentBlock("Google-Extended"),
    `User-agent: *`,
    signal,
    "Allow: /",
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    "",
    ...AI_BOT_AGENTS.filter((agent) => agent !== "Google-Extended").flatMap(
      (agent) => agentBlock(agent),
    ),
  ];

  if (includeSitemap) {
    lines.push(`Sitemap: ${domain}/sitemap.xml`);
  }

  return `${lines.join("\n").trim()}\n`;
}

const robots = buildRobotsTxt({ includeSitemap: !isStaging });

writeFileSync(resolve(distDir, "robots.txt"), robots);
console.log(
  `Wrote dist/robots.txt (${isStaging ? "staging — HTML noindex" : "production"})`,
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
