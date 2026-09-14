const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Baserow Tag may be a string, `{ value }`, or a multiple_select array. */
export function normalizeTags(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const tag = raw.trim();
    return tag ? [tag] : [];
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      for (const tag of normalizeTags(item)) {
        if (!out.includes(tag)) out.push(tag);
      }
    }
    return out;
  }
  if (typeof raw === "object" && "value" in raw) {
    return normalizeTags((raw as { value?: unknown }).value);
  }
  return [];
}

export function mergeTagValues(existing: string[], add: string): string[] {
  const tag = add.trim();
  if (!tag) return [...existing];
  if (existing.includes(tag)) return [...existing];
  return [...existing, tag];
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

type BaserowRow = {
  id: number;
  Email?: string;
  Tag?: unknown;
  Synced?: boolean;
};

type FetchImpl = typeof fetch;

/** Cloudflare Workers rejects unbound `const f = fetch; f()` (Illegal invocation). */
function resolveFetch(fetchImpl?: FetchImpl): FetchImpl {
  return fetchImpl ?? ((input, init) => fetch(input, init));
}

async function findRowByEmail(opts: {
  email: string;
  apiKey: string;
  apiUrl: string;
  tableId: string;
  fetchImpl: FetchImpl;
}): Promise<BaserowRow | null> {
  const url = new URL(
    `${opts.apiUrl}/api/database/rows/table/${opts.tableId}/`,
  );
  url.searchParams.set("user_field_names", "true");
  url.searchParams.set("filter__Email__equal", opts.email);
  url.searchParams.set("size", "1");

  const upstream = await opts.fetchImpl(url.toString(), {
    headers: { Authorization: `Token ${opts.apiKey}` },
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error(
      "[wifi-captive-portal] Baserow lookup failed",
      upstream.status,
      detail.slice(0, 300),
    );
    return null;
  }

  const body = (await upstream.json()) as { results?: BaserowRow[] };
  const row = body.results?.[0];
  return row?.id ? row : null;
}

export async function subscribeEmailToBaserow(opts: {
  email: string;
  tag: string;
  apiKey: string;
  apiUrl: string;
  tableId: string;
  fetchImpl?: typeof fetch;
  /** Internal: one retry after create race on unique Email. */
  _attempt?: number;
}): Promise<SubscribeResult> {
  const email = normalizeEmail(opts.email);
  if (!email) {
    return { ok: false, status: 400, error: "Valid email required." };
  }

  const tag = opts.tag.trim() || "wifi";
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const attempt = opts._attempt ?? 0;
  const headers = {
    Authorization: `Token ${opts.apiKey}`,
    "Content-Type": "application/json",
  };

  const existing = await findRowByEmail({
    email,
    apiKey: opts.apiKey,
    apiUrl: opts.apiUrl,
    tableId: opts.tableId,
    fetchImpl,
  });

  if (existing) {
    const current = normalizeTags(existing.Tag);
    const merged = mergeTagValues(current, tag);
    if (merged.length === current.length) {
      return { ok: true };
    }

    const patchUrl = `${opts.apiUrl}/api/database/rows/table/${opts.tableId}/${existing.id}/?user_field_names=true`;
    const upstream = await fetchImpl(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        Tag: merged,
        Synced: false,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error(
        "[wifi-captive-portal] Baserow tag merge failed",
        upstream.status,
        detail.slice(0, 300),
      );
      return parseBaserowError(upstream.status, detail);
    }

    return { ok: true };
  }

  const createUrl = `${opts.apiUrl}/api/database/rows/table/${opts.tableId}/?user_field_names=true`;
  const upstream = await fetchImpl(createUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      Email: email,
      Tag: [tag],
      "Signed up": new Date().toISOString().slice(0, 10),
      Synced: false,
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    const isDuplicate =
      upstream.status === 400 &&
      /ERROR_FIELD_DATA_CONSTRAINT|field constraint|unique|duplicate|already exists/i.test(
        detail,
      );
    if (isDuplicate && attempt < 1) {
      return subscribeEmailToBaserow({ ...opts, _attempt: attempt + 1 });
    }
    console.error(
      "[wifi-captive-portal] Baserow write failed",
      upstream.status,
      detail.slice(0, 300),
    );
    return parseBaserowError(upstream.status, detail);
  }

  return { ok: true };
}

function parseBaserowError(status: number, detail: string): SubscribeResult {
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Lots of signups just now. Try again in a little while.",
    };
  }

  let body: { error?: string; detail?: unknown } | null = null;
  try {
    body = JSON.parse(detail) as { error?: string; detail?: unknown };
  } catch {
    body = null;
  }

  const code = body?.error ?? "";
  const message = String(body?.detail ?? body?.error ?? detail);

  if (
    status === 400 &&
    (code === "ERROR_FIELD_DATA_CONSTRAINT" ||
      /field constraint|unique|duplicate|already exists/i.test(message))
  ) {
    return { ok: true };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      status: 502,
      error: "Something went wrong. Try again?",
    };
  }

  if (status === 400 && /email|invalid|validation/i.test(message)) {
    return {
      ok: false,
      status: 400,
      error: "That doesn't look like a valid email.",
    };
  }

  return { ok: false, status: 502, error: "Something went wrong. Try again?" };
}
