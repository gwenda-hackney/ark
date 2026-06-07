const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "Valid email required." }, 400);
  }

  const tag = body.tag ?? "prelaunch";
  const username = context.env.PUBLIC_BUTTONDOWN_USERNAME;

  if (username) {
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
        return json({ error: "Something went wrong. Try again?" }, 502);
      }
    }
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
