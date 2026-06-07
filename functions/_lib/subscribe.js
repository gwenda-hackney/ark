const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUTTONDOWN_API = "https://api.buttondown.com/v1/subscribers";

export async function subscribeEmail({ email: rawEmail, tag = "prelaunch", env = {} }) {
  const email = rawEmail?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Valid email required." };
  }

  const apiKey = env.BUTTONDOWN_API_KEY;
  const username = env.PUBLIC_BUTTONDOWN_USERNAME;

  if (apiKey) {
    const headers = {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      "X-Buttondown-Collision-Behavior": "add",
    };
    if (env.BUTTONDOWN_BYPASS_FIREWALL === "true") {
      headers["X-Buttondown-Bypass-Firewall"] = "true";
    }

    const upstream = await fetch(BUTTONDOWN_API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email_address: email,
        tags: [tag],
        type: "regular",
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      const error = parseButtondownError(upstream.status, detail);
      if (error) return error;
    }
  } else if (username) {
    const upstream = await fetch(
      `https://buttondown.email/api/emails/embed-subscribe/${username}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, tag }),
      },
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      const alreadyOnList = /already|exists|subscribed/i.test(text);
      if (!alreadyOnList) {
        return { ok: false, status: 502, error: "Something went wrong. Try again?" };
      }
    }
  }

  return { ok: true, status: 200 };
}

function parseButtondownError(status, detail) {
  let body;
  try {
    body = JSON.parse(detail);
  } catch {
    body = null;
  }

  const code = body?.code ?? "";
  const message = body?.detail ?? detail;

  if (status === 429 || code === "rate_limited") {
    return {
      ok: false,
      status: 429,
      error: "Lots of signups just now — try again in a little while.",
    };
  }

  if (
    status === 400 &&
    (code === "subscriber_already_exists" ||
      /already|exists|subscribed/i.test(message))
  ) {
    return null;
  }

  if (code === "subscriber_blocked") {
    return {
      ok: false,
      status: 400,
      error: "That email couldn't be added. Try a different address?",
    };
  }

  return { ok: false, status: 502, error: "Something went wrong. Try again?" };
}
