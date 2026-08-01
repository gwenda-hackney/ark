function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type PortalPageInput = {
  id?: string;
  ap?: string;
  url?: string;
  ssid?: string;
  site?: string;
  error?: string;
};

const SHARED_STYLES = `
  @font-face {
    font-family: "Cormorant Garamond";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/cormorant-garamond-latin-400-normal.woff2") format("woff2");
  }
  @font-face {
    font-family: "Cormorant Garamond";
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url("/fonts/cormorant-garamond-latin-500-normal.woff2") format("woff2");
  }
  @font-face {
    font-family: "Cormorant Garamond";
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url("/fonts/cormorant-garamond-latin-600-normal.woff2") format("woff2");
  }
  @font-face {
    font-family: "Lora";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/lora-latin-400-normal.woff2") format("woff2");
  }
  :root {
    --bg: #0d0d0d;
    --bg-elevated: #141414;
    --bg-card: #1a1a1a;
    --text: #e8e4dc;
    --muted: #8a8680;
    --gold: #c9a84c;
    --gold-dark: #8b6914;
    --error: #c97a7a;
    --font-display: "Cormorant Garamond", Georgia, "Times New Roman", serif;
    --font-body: "Lora", Georgia, "Times New Roman", serif;
    --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { min-height: 100%; }
  body {
    font-family: var(--font-body);
    color: var(--text);
    background:
      radial-gradient(ellipse 90% 55% at 50% -18%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 58%),
      radial-gradient(ellipse 70% 45% at 100% 110%, color-mix(in srgb, #23211b 85%, transparent), transparent 52%),
      linear-gradient(180deg, #161310 0%, var(--bg) 42%, #0a0908 100%);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2.25rem 1.25rem;
  }
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  main {
    position: relative;
    width: min(100%, 26rem);
    text-align: center;
  }
  .logo {
    display: block;
    width: min(100%, 13.5rem);
    height: auto;
    margin: 0 auto 1.85rem;
  }
  .panel {
    background: color-mix(in srgb, var(--bg-card) 94%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 10%, transparent);
    padding: 1.85rem 1.5rem 1.55rem;
    text-align: left;
  }
  .eyebrow {
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--gold);
    margin-bottom: 0.85rem;
  }
  h1 {
    font-family: var(--font-display);
    font-size: clamp(1.85rem, 6vw, 2.35rem);
    font-weight: 500;
    letter-spacing: 0.03em;
    line-height: 1.2;
    color: var(--text);
  }
  h1::after {
    content: "";
    display: block;
    width: 2rem;
    height: 1px;
    margin-top: 1rem;
    margin-bottom: 1.1rem;
    background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 70%, transparent), transparent);
  }
  .lead {
    color: var(--muted);
    font-size: 1.02rem;
    line-height: 1.7;
    margin-bottom: 1.45rem;
  }
  label {
    display: block;
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 0.45rem;
  }
  input[type="email"] {
    width: 100%;
    appearance: none;
    background: var(--bg-elevated);
    border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 1.02rem;
    padding: 0.9rem 0.95rem;
    margin-bottom: 1.1rem;
  }
  input[type="email"]::placeholder { color: color-mix(in srgb, var(--muted) 75%, transparent); }
  input[type="email"]:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--gold) 35%, transparent);
  }
  button {
    width: 100%;
    appearance: none;
    border: 1px solid var(--gold);
    background: var(--gold);
    color: var(--bg);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.95rem 1rem;
    cursor: pointer;
    transition: background 0.35s var(--ease-smooth), color 0.35s var(--ease-smooth), box-shadow 0.4s var(--ease-smooth);
  }
  button:hover {
    background: transparent;
    color: var(--gold);
    box-shadow: 0 0 28px color-mix(in srgb, var(--gold) 22%, transparent);
  }
  button:active { transform: scale(0.98); }
  .consent {
    margin-top: 1rem;
    color: var(--muted);
    font-size: 0.86rem;
    line-height: 1.55;
  }
  .error {
    color: var(--error);
    font-size: 0.95rem;
    margin-bottom: 1rem;
  }
`;

export function renderPortalPage(input: PortalPageInput = {}): string {
  const error = input.error
    ? `<p class="error" role="alert">${escapeHtml(input.error)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#0d0d0d" />
  <title>Wi‑Fi · Gwenda</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <main>
    <img class="logo" src="/logo.png" width="512" height="320" alt="Gwenda" />
    <div class="panel">
      <p class="eyebrow">Guest Wi‑Fi</p>
      <h1>Welcome aboard</h1>
      <p class="lead">Share your email to join the network.</p>
      ${error}
      <form method="post" action="/authorize" autocomplete="email">
        <input type="hidden" name="id" value="${escapeHtml(input.id ?? "")}" />
        <input type="hidden" name="ap" value="${escapeHtml(input.ap ?? "")}" />
        <input type="hidden" name="url" value="${escapeHtml(input.url ?? "")}" />
        <input type="hidden" name="ssid" value="${escapeHtml(input.ssid ?? "")}" />
        <input type="hidden" name="site" value="${escapeHtml(input.site ?? "default")}" />
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required inputmode="email" autocomplete="email" placeholder="your@email.com" autofocus />
        <button type="submit">Enter our world</button>
        <p class="consent">The occasional note from Gwenda. Leave anytime.</p>
      </form>
    </div>
  </main>
</body>
</html>`;
}

export function renderSuccessPage(redirectUrl: string): string {
  const safe = escapeHtml(redirectUrl);
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="theme-color" content="#0d0d0d" />
  <meta http-equiv="refresh" content="2;url=${safe}" />
  <title>Connected · Gwenda</title>
  <style>
    ${SHARED_STYLES}
    .success {
      text-align: center;
    }
    .success h1::after {
      margin-inline: auto;
    }
    .success .lead { margin-bottom: 0; }
    .success a { color: var(--gold); }
  </style>
</head>
<body>
  <main class="success">
    <img class="logo" src="/logo.png" width="512" height="320" alt="Gwenda" />
    <p class="eyebrow">You’re online</p>
    <h1>Connected</h1>
    <p class="lead">Opening <a href="${safe}">gwenda.co.uk</a>…</p>
  </main>
</body>
</html>`;
}
