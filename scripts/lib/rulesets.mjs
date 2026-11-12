/**
 * Repository rulesets kept in the repo (.github/rulesets/*.json, #301) and
 * applied through GitHub's REST API (`repos/{owner}/{repo}/rulesets`). A file
 * is the API's request body; applying finds the repo's ruleset by name and
 * creates it, updates it, or leaves it alone when nothing differs.
 *
 * The diff compares only what the file sets: GitHub adds ids, links and
 * defaulted parameters, which aren't changes. Rules are matched by type (a
 * ruleset has one of each); a rule GitHub has and the file lacks is removed.
 *
 * `api(method, path, body)` returns parsed JSON, so tests use a fake.
 */

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** JSON with sorted keys and sorted arrays: GitHub may list items in another order. */
function canonical(value) {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Changes for each value `desired` sets that `current` doesn't have. */
function subsetDiff(path, current, desired, out) {
  if (isObject(desired)) {
    for (const key of Object.keys(desired)) {
      subsetDiff(path ? `${path}.${key}` : key, isObject(current) ? current[key] : undefined, desired[key], out);
    }
    return;
  }
  if (canonical(current) !== canonical(desired)) {
    out.push({ op: current === undefined ? "+" : "~", path, from: current, to: desired });
  }
}

/** What applying `desired` would change in `current` (GitHub's ruleset, or {}). */
export function rulesetDiff(current, desired) {
  const out = [];
  const { rules = [], bypass_actors: bypass, ...settings } = desired;
  subsetDiff("", current, settings, out);
  if (bypass && canonical(current.bypass_actors || []) !== canonical(bypass)) {
    out.push({ op: "~", path: "bypass_actors", from: current.bypass_actors || [], to: bypass });
  }
  const have = new Map((current.rules || []).map((rule) => [rule.type, rule]));
  for (const rule of rules) {
    const path = `rules.${rule.type}`;
    if (!have.has(rule.type)) out.push({ op: "+", path, to: rule.parameters });
    else subsetDiff(`${path}.parameters`, have.get(rule.type).parameters, rule.parameters || {}, out);
  }
  for (const type of have.keys()) {
    if (!rules.some((rule) => rule.type === type)) out.push({ op: "-", path: `rules.${type}` });
  }
  return out;
}

export function formatDiff(changes) {
  return changes
    .map(({ op, path, from, to }) => {
      if (op === "~") return `~ ${path}: ${canonical(from)} → ${canonical(to)}`;
      if (op === "+" && to !== undefined) return `+ ${path}: ${canonical(to)}`;
      return `${op} ${path}`;
    })
    .join("\n");
}

/**
 * Create or update `ruleset` on `repo`, by name. Returns { action, changes },
 * action being "create", "update", "none" (up to date) or "dry-run".
 */
export function applyRuleset({ api, repo, ruleset, dryRun = false, log = console.log }) {
  const label = `Ruleset "${ruleset.name}" on ${repo}`;
  // Only the repo's own: an organization's rulesets are managed there.
  const listed = api("GET", `repos/${repo}/rulesets?includes_parents=false&per_page=100`) || [];
  const found = listed.find(
    (r) => r.name === ruleset.name && r.target === ruleset.target && (r.source_type || "Repository") === "Repository",
  );
  const current = found ? api("GET", `repos/${repo}/rulesets/${found.id}`) : {};
  const changes = rulesetDiff(current, ruleset);
  if (found && !changes.length) {
    log(`${label} is up to date.`);
    return { action: "none", changes };
  }
  const verb = found ? "update" : "create";
  log(`${label}: ${dryRun ? `would ${verb}` : `${verb.replace(/e$/, "")}ing`} it.\n${formatDiff(changes)}`);
  if (dryRun) return { action: "dry-run", changes };
  if (found) api("PUT", `repos/${repo}/rulesets/${found.id}`, ruleset);
  else api("POST", `repos/${repo}/rulesets`, ruleset);
  return { action: verb, changes };
}
