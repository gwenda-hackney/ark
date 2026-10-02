/**
 * One comment per pull request listing the branch's preview sites (#60). Each
 * preview job (web, ops, brand) updates its own row in place, so the PR always
 * shows the latest link for every app that has one.
 */

export const MARKER = "<!-- ark-previews -->";

const LABELS = {
  web: "Website (dev data, drafts shown)",
  ops: "Ops (dev data)",
  brand: "Brand guidelines",
};
const ORDER = Object.keys(LABELS);

/** Rows already in a comment body: { app: "| ... |" }. */
function parseRows(body) {
  const rows = {};
  for (const line of String(body || "").split("\n")) {
    const match = line.match(/^\| .*<!-- app:(\w+) --> \|$/);
    if (match) rows[match[1]] = line;
  }
  return rows;
}

/** The comment body with `app`'s row set to `url` (at `sha`), keeping the others. */
export function previewCommentBody(existing, { app, url, sha }) {
  const rows = parseRows(existing);
  rows[app] = `| ${LABELS[app] || app} | [${url.replace(/^https:\/\//, "")}](${url}) | \`${sha.slice(0, 7)}\` <!-- app:${app} --> |`;
  const ordered = Object.keys(rows).sort(
    (a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );
  return [
    MARKER,
    "### Previews for this branch",
    "",
    "| App | Link | Commit |",
    "|---|---|---|",
    ...ordered.map((name) => rows[name]),
    "",
    "Updated on every push. Dev data only; nothing here touches production.",
  ].join("\n");
}

/**
 * Create or update the comment on the open PR for `branch`. Returns the PR
 * number, or 0 when the branch has no open PR (nothing to do).
 */
export async function upsertPreviewComment({ repo, token, branch, app, url, sha, fetchImpl = fetch }) {
  const gh = async (path, init = {}) => {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`GitHub ${init.method || "GET"} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const owner = repo.split("/")[0];
  const pulls = await gh(`/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  if (!pulls.length) return 0;
  const number = pulls[0].number;
  const comments = await gh(`/issues/${number}/comments?per_page=100`);
  const mine = comments.find((comment) => String(comment.body).startsWith(MARKER));
  const body = previewCommentBody(mine?.body, { app, url, sha });
  if (mine) await gh(`/issues/comments/${mine.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  else await gh(`/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return number;
}
