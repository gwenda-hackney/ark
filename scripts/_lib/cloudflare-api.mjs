/**
 * Shared Cloudflare API helper for CI scripts.
 */
export async function cf(
  path,
  { method = "GET", body, token, accountId } = {},
) {
  const apiToken = token || process.env.CLOUDFLARE_API_TOKEN;
  const account = accountId || process.env.CLOUDFLARE_ACCOUNT_ID;

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.errors?.[0]?.code;
    throw err;
  }
  return data.result;
}
