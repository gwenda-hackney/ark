/** Public site origin for links in emails and tickets. Never localhost. */
export function resolvePublicOrigin(origin, env) {
  const configured =
    env?.INVITE_BASE_URL?.trim() ||
    env?.SITE_URL?.trim() ||
    "https://gwenda.co.uk";
  const fallback = configured.replace(/\/$/, "");

  if (!origin?.trim()) return fallback;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".localhost")
    ) {
      return fallback;
    }
    return url.origin;
  } catch {
    return fallback;
  }
}
