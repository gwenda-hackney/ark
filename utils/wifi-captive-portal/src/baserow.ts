const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function subscribeEmailToBaserow(opts: {
  email: string;
  tag: string;
  apiKey: string;
  apiUrl: string;
  tableId: string;
  fetchImpl?: typeof fetch;
}): Promise<SubscribeResult> {
  const email = normalizeEmail(opts.email);
  if (!email) {
    return { ok: false, status: 400, error: "Valid email required." };
  }

  const tag = opts.tag.trim() || "wifi";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.apiUrl}/api/database/rows/table/${opts.tableId}/?user_field_names=true`;

  const upstream = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Email: email,
      Tag: tag,
      "Signed up": new Date().toISOString().slice(0, 10),
      Synced: false,
    }),
  });

  if (!upstream.ok) {
    return parseBaserowError(upstream.status, await upstream.text());
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
