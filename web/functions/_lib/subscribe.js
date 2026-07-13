import { DEFAULT_BASEROW_API, subscribeTableId } from "./baserow.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribeEmail({
  email: rawEmail,
  tag = "prelaunch",
  env = {},
}) {
  const email = rawEmail?.trim().toLowerCase();
  const tagValue =
    (typeof tag === "string" ? tag : "prelaunch").trim() || "prelaunch";
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Valid email required." };
  }

  const apiKey = env.BASEROW_API_KEY;
  const tableId = subscribeTableId(env);
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

  const url = `${apiBase}/api/database/rows/table/${tableId}/?user_field_names=true`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Email: email,
      Tag: tagValue,
      "Signed up": new Date().toISOString().slice(0, 10),
      Synced: false,
    }),
  });

  if (!upstream.ok) {
    return parseBaserowError(upstream.status, await upstream.text());
  }

  return { ok: true, status: 200 };
}

function parseBaserowError(status, detail) {
  if (status === 429) {
    return {
      ok: false,
      status: 429,
      error: "Lots of signups just now — try again in a little while.",
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
