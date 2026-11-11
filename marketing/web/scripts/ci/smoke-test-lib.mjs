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

/**
 * Home is ours and has a way onto the list: the sign-up form in the foot of
 * every page (EmailSignup, `form.signup-form`; #240), not a link elsewhere.
 *
 * @param {string} html
 */
export function assertHomePageHealthy(html) {
  if (!/<title>\s*Gwenda/i.test(html)) {
    throw new Error("Homepage missing expected <title>");
  }
  if (!/<form\b[^>]*\bclass=["'][^"']*\bsignup-form\b/i.test(html)) {
    throw new Error("Homepage missing the list sign-up form");
  }
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return (match?.[1] ?? match?.[2] ?? "")
    .replace(/&(?:amp|#38|#x26);/gi, "&")
    .trim();
}

/**
 * The icons a page's head links to (rel "icon" and "apple-touch-icon"), in
 * order: the smoke test fetches each, so a missing one fails the deploy.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function iconPaths(html) {
  const paths = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(tag, "rel").toLowerCase().split(/\s+/);
    if (rel.includes("icon") || rel.includes("apple-touch-icon"))
      paths.push(attribute(tag, "href"));
  }
  return paths;
}

/**
 * The web app manifest a page's head links to; empty when there is none.
 *
 * @param {string} html
 */
export function manifestPath(html) {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attribute(tag, "rel").toLowerCase() === "manifest")
      return attribute(tag, "href");
  }
  return "";
}

/** The width a picture's address asks the image CDN for; 0 when it names none. */
function askedWidth(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "cdn.sanity.io") return null;
    return Number(parsed.searchParams.get("w")) || 0;
  } catch {
    return null;
  }
}

/** The widest a picture with no choice of sizes may ask for. */
const WIDEST_ALONE = 1280;

/**
 * Pictures on a page that download bigger than they are shown (#240): a
 * flyer from the image CDN must offer a choice of sizes, each address
 * asking for the width it says it is (once every "640w" and "1280w" was the
 * same 1600px file, and a phone's 80px thumbnail downloaded it). A picture
 * with no choice must ask for a width, and a modest one.
 *
 * @param {string} html
 * @returns {string[]} what's wrong, one line a picture; empty when all is well
 */
export function oversizedPictures(html) {
  const problems = [];
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attribute(tag, "src");
    const candidates = attribute(tag, "srcset")
      .split(/,\s+/)
      .map((candidate) => candidate.trim().split(/\s+/))
      .filter(([url]) => url);
    const short = (url) => url.replace(/^.*\//, "").slice(0, 80);
    if (!candidates.length) {
      const asked = askedWidth(src);
      if (asked === null) continue;
      if (!asked || asked > WIDEST_ALONE) {
        problems.push(
          `${short(src)}: one size for every screen, ${asked ? `${asked}px wide` : "the original file"}`,
        );
      }
      continue;
    }
    for (const [url, descriptor = ""] of candidates) {
      const asked = askedWidth(url);
      if (asked === null) continue;
      const said = Number(/^(\d+)w$/.exec(descriptor)?.[1]) || 0;
      if (said && asked !== said) {
        problems.push(
          `${short(url)}: offered as ${said}px wide, asks for ${asked ? `${asked}px` : "the original file"}`,
        );
      }
    }
  }
  return [...new Set(problems)];
}

/** @param {string} html @param {string} path */
export function assertPicturesSized(html, path) {
  const problems = oversizedPictures(html);
  if (problems.length) {
    throw new Error(
      `${path} has ${problems.length} picture(s) bigger than shown:\n  ${problems.slice(0, 5).join("\n  ")}`,
    );
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

/**
 * GET /api/subscribe hands a page its CSRF token and nothing secret: the key
 * that signs form links once came back here as `secret`, readable by anyone.
 * @param {unknown} data
 */
export function assertSubscribeTokens(data) {
  if (!data || typeof data !== "object" || !data.csrfToken) {
    throw new Error("missing csrfToken in response");
  }
  if ("secret" in data) {
    throw new Error(
      "response hands out a secret; the signing key must stay on the server",
    );
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
