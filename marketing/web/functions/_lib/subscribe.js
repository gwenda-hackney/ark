import { DEFAULT_BASEROW_API, resolveSubscribeTableId } from "./baserow.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Baserow Tag may be a string, `{ value }`, or a multiple_select array. */
export function normalizeTags(raw) {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const tag = raw.trim();
    return tag ? [tag] : [];
  }
  if (Array.isArray(raw)) {
    const out = [];
    for (const item of raw) {
      for (const tag of normalizeTags(item)) {
        if (!out.includes(tag)) out.push(tag);
      }
    }
    return out;
  }
  if (typeof raw === "object" && "value" in raw) {
    return normalizeTags(raw.value);
  }
  return [];
}

function mergeTagValues(existing, add) {
  const tag = add.trim();
  if (!tag) return [...existing];
  if (existing.includes(tag)) return [...existing];
  return [...existing, tag];
}

async function findRowByEmail({ email, apiKey, apiBase, tableId }) {
  const url = new URL(`${apiBase}/api/database/rows/table/${tableId}/`);
  url.searchParams.set("user_field_names", "true");
  url.searchParams.set("filter__Email__equal", email);
  url.searchParams.set("size", "1");

  const upstream = await fetch(url.toString(), {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!upstream.ok) return null;
  const body = await upstream.json();
  const row = body.results?.[0];
  return row?.id ? row : null;
}

export async function subscribeEmail({
  email: rawEmail,
  tag = "prelaunch",
  env = {},
  _attempt = 0,
}) {
  const email = rawEmail?.trim().toLowerCase();
  const tagValue =
    (typeof tag === "string" ? tag : "prelaunch").trim() || "prelaunch";
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Valid email required." };
  }

  const apiKey = env.BASEROW_API_KEY;
  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );

  if (!apiKey) {
    return {
      ok: false,
      status: 502,
      error: "Something went wrong. Try again?",
    };
  }

  const resolved = await resolveSubscribeTableId(env);
  if (!resolved.ok) {
    return {
      ok: false,
      status: 502,
      error: "Something went wrong. Try again?",
    };
  }
  const { tableId } = resolved;

  const headers = {
    Authorization: `Token ${apiKey}`,
    "Content-Type": "application/json",
  };

  const existing = await findRowByEmail({
    email,
    apiKey,
    apiBase,
    tableId,
  });

  if (existing) {
    const current = normalizeTags(existing.Tag);
    const merged = mergeTagValues(current, tagValue);
    if (merged.length === current.length) {
      return { ok: true, status: 200 };
    }

    const upstream = await fetch(
      `${apiBase}/api/database/rows/table/${tableId}/${existing.id}/?user_field_names=true`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ Tag: merged, Synced: false }),
      },
    );
    if (!upstream.ok) {
      return parseBaserowError(upstream.status, await upstream.text());
    }
    return { ok: true, status: 200 };
  }

  const upstream = await fetch(
    `${apiBase}/api/database/rows/table/${tableId}/?user_field_names=true`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        Email: email,
        Tag: [tagValue],
        "Signed up": new Date().toISOString().slice(0, 10),
        Synced: false,
      }),
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text();
    const isDuplicate =
      upstream.status === 400 &&
      /ERROR_FIELD_DATA_CONSTRAINT|field constraint|unique|duplicate|already exists/i.test(
        detail,
      );
    if (isDuplicate && _attempt < 1) {
      return subscribeEmail({
        email,
        tag: tagValue,
        env,
        _attempt: _attempt + 1,
      });
    }
    return parseBaserowError(upstream.status, detail);
  }

  return { ok: true, status: 200 };
}

function parseBaserowError(status, detail) {
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Lots of signups just now. Try again in a little while.",
    };
  }

  let body;
  try {
    body = JSON.parse(detail);
  } catch {
    body = null;
  }

  const code = body?.error ?? "";
  const message = body?.detail ?? body?.error ?? detail;

  if (
    status === 400 &&
    (code === "ERROR_FIELD_DATA_CONSTRAINT" ||
      /field constraint|unique|duplicate|already exists/i.test(String(message)))
  ) {
    return { ok: true, status: 200 };
  }

  if (status === 401 || status === 403) {
    return {
      ok: false,
      status: 502,
      error: "Something went wrong. Try again?",
    };
  }

  if (status === 400 && /email|invalid|validation/i.test(String(message))) {
    return {
      ok: false,
      status: 400,
      error: "That doesn't look like a valid email.",
    };
  }

  return { ok: false, status: 502, error: "Something went wrong. Try again?" };
}
