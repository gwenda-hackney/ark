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
  if (!/href=["']\/join-list["']/i.test(html)) {
    throw new Error("Homepage missing the list path");
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

/** `--forms play,party` as web addresses; empty when not given. */
export function parseFormsArg(value) {
  return String(value ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

/**
 * One line of the deep health report. WAIT is a form its post-deploy
 * migration hasn't made yet: not a failure, and not tested either.
 * @param {{ name: string, ok: boolean, pending?: boolean, detail?: string, error?: string, ms?: number }} check
 */
export function deepCheckLine(check) {
  const status = !check.ok ? "FAIL" : check.pending ? "WAIT" : "OK";
  return `${status} ${check.name}: ${check.ok ? check.detail : check.error} (${check.ms}ms)`;
}

/** The forms a deep health run left untested, for the run after the migrations. */
export function pendingForms(checks) {
  return (checks ?? [])
    .filter((check) => check?.ok && check.pending && check.form)
    .map((check) => String(check.form));
}
