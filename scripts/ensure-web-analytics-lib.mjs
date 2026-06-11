/** @param {Array<{host?: string, inclusive?: boolean, is_paused?: boolean}>} rules */
export function hostsWithRule(rules, inclusive) {
  return new Set(
    (rules ?? [])
      .filter((rule) => rule.inclusive === inclusive && !rule.is_paused && rule.host)
      .map((rule) => rule.host),
  );
}
