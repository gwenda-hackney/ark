/**
 * A D1 database over Cloudflare's REST API, shaped like the Workers binding
 * (prepare/bind/all/first/run, batch). For code with no binding: Node scripts,
 * the website build in CI and `astro dev`. Needs a token with D1 access to
 * the account (CLOUDFLARE_API_TOKEN).
 *
 * The binding runs a batch as one transaction. Whether the REST batch does is
 * not documented, so scripts that rely on it check the outcome (#190 spike).
 */

const API = "https://api.cloudflare.com/client/v4";
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ accountId: string, databaseId: string, token: string,
 *   fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void> }} opts
 */
export function d1Http({
  accountId,
  databaseId,
  token,
  fetchImpl = fetch,
  wait = sleep,
}) {
  if (!accountId || !databaseId || !token) {
    throw new Error("d1Http needs accountId, databaseId and token.");
  }
  const url = `${API}/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function send(body) {
    for (let attempt = 1; ; attempt += 1) {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
        await wait(Math.min(2 ** (attempt - 1), 30) * 1000);
        continue;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        const detail =
          payload?.errors?.map((e) => e.message).join("; ") ||
          `HTTP ${response.status}`;
        throw new Error(`D1 query failed: ${detail}`);
      }
      return payload.result;
    }
  }

  function prepared(sql, params = []) {
    return {
      sql,
      params,
      bind: (...values) => prepared(sql, values),
      async all() {
        const [result] = await send({ sql, params });
        return {
          results: result?.results ?? [],
          success: true,
          meta: result?.meta ?? {},
        };
      },
      async first(column) {
        const { results } = await this.all();
        const row = results[0] ?? null;
        return column && row ? (row[column] ?? null) : row;
      },
      async run() {
        const [result] = await send({ sql, params });
        return { success: true, meta: result?.meta ?? {} };
      },
    };
  }

  return {
    prepare: (sql) => prepared(sql),
    async batch(statements) {
      const results = await send({
        batch: statements.map((s) => ({ sql: s.sql, params: s.params })),
      });
      return results.map((result) => ({
        results: result?.results ?? [],
        success: true,
        meta: result?.meta ?? {},
      }));
    },
  };
}
