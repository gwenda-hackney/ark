/**
 * Create the Cloudflare Pages project if it does not exist yet.
 * CI runs this before the first deploy.
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME || "gwenda";
const BRANCH = process.env.PAGES_PRODUCTION_BRANCH || "main";

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

const existing = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);

if (existing.data.success) {
  const currentBranch = existing.data.result.production_branch;
  if (currentBranch !== BRANCH) {
    const updated = await cf(
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`,
      {
        method: "PATCH",
        body: { production_branch: BRANCH },
      },
    );
    if (!updated.data.success) {
      const msg =
        updated.data.errors?.map((e) => e.message).join("; ") ||
        "Unknown error";
      console.error(`Could not update production branch: ${msg}`);
      process.exit(1);
    }
    console.log(
      `Updated Pages project "${PROJECT}" production branch: ${currentBranch} → ${BRANCH}.`,
    );
  } else {
    console.log(
      `Pages project "${PROJECT}" already exists (branch: ${BRANCH}).`,
    );
  }
  process.exit(0);
}

if (existing.data.errors?.[0]?.code !== 8000007) {
  const msg =
    existing.data.errors?.map((e) => e.message).join("; ") || "Unknown error";
  console.error(`Could not check Pages project: ${msg}`);
  process.exit(1);
}

const created = await cf(`/accounts/${ACCOUNT_ID}/pages/projects`, {
  method: "POST",
  body: {
    name: PROJECT,
    production_branch: BRANCH,
  },
});

if (!created.data.success) {
  const msg =
    created.data.errors?.map((e) => e.message).join("; ") || "Unknown error";
  console.error(`Could not create Pages project: ${msg}`);
  process.exit(1);
}

console.log(
  `Created Pages project "${PROJECT}" (production branch: ${BRANCH}).`,
);
