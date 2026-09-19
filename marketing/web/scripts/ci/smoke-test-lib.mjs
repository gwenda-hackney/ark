/** @param {string} html */
export function collectSameOriginAssetPaths(html, origin) {
  const paths = new Set();
  const originUrl = new URL(origin);

  for (const match of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) {
    const raw = match[1];
    if (!raw || raw.startsWith("data:") || raw.startsWith("http")) continue;
    try {
      const resolved = new URL(raw, originUrl);
      if (resolved.origin !== originUrl.origin) continue;
      paths.add(resolved.pathname + resolved.search);
    } catch {
      /* ignore malformed URLs */
    }
  }

  return [...paths];
}

/** @param {string} html */
export function assertHomePageHealthy(html) {
  if (!/<title>\s*Gwenda/i.test(html)) {
    throw new Error("Homepage missing expected <title>");
  }
  if (!/id=["']signup-form["']/i.test(html)) {
    throw new Error("Homepage missing expected signup form");
  }
}

/** @param {unknown} data */
export function assertHealthPayload(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Health payload is not an object");
  }
  if (data.ok !== true) {
    throw new Error("Health payload missing ok: true");
  }
  if (data.service !== "gwenda") {
    throw new Error(`Health payload unexpected service: ${data.service}`);
  }
}
