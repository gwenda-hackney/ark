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
  /* Sending: the sign-up and the UniFi call take a moment, so say so. */
  button[aria-busy="true"],
  button[aria-busy="true"]:hover {
    background: var(--gold);
    color: var(--bg);
    box-shadow: none;
    cursor: progress;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    animation: pulse 1.6s var(--ease-smooth) infinite;
  }
  button[aria-busy="true"]::before {
    content: "";
    width: 0.95rem;
    height: 0.95rem;
    border: 1.5px solid color-mix(in srgb, var(--bg) 30%, transparent);
    border-top-color: var(--bg);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 50% { opacity: 0.75; } }
  @media (prefers-reduced-motion: reduce) {
    button[aria-busy="true"] { animation: none; }
    button[aria-busy="true"]::before { animation-duration: 2.4s; }
  }
  .consent {
    margin-top: 1rem;
    color: var(--muted);
    font-size: 0.86rem;
    line-height: 1.55;
  }
  .error {
    color: var(--error);
    font-size: 0.92rem;
    line-height: 1.5;
    background: color-mix(in srgb, var(--error) 8%, transparent);
    border-left: 2px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 0.7rem 0.85rem;
    margin-bottom: 1.2rem;
  }
`;

/** Meta-refresh delay, shared with the progress bar animation. */
const REDIRECT_SECONDS = 2;

const SUCCESS_STYLES = `
  .success .panel {
    text-align: center;
    padding: 2.15rem 1.6rem 1.85rem;
    animation: rise 0.8s var(--ease-smooth) both;
  }
  @keyframes rise {
    from { opacity: 0; transform: translateY(0.5rem); }
    to { opacity: 1; transform: none; }
  }
  .seal {
    width: 3.1rem;
    height: 3.1rem;
    margin: 0 auto 1.3rem;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 70%);
  }
  .seal svg {
    width: 1.35rem;
    height: 1.35rem;
    stroke: var(--gold);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .seal path {
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    animation: draw 0.9s var(--ease-smooth) 0.25s forwards;
  }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .success h1::after {
    margin-inline: auto;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--gold) 70%, transparent), transparent);
  }
  .success .lead { margin-bottom: 0; }
  .success a {
    color: var(--gold);
    text-decoration: none;
    border-bottom: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
  }
  .progress {
    height: 1px;
    margin-top: 1.7rem;
    background: color-mix(in srgb, var(--text) 12%, transparent);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    width: 0;
    background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 45%, transparent), var(--gold));
    animation: fill ${REDIRECT_SECONDS}s linear forwards;
  }
  @keyframes fill { to { width: 100%; } }
  @media (prefers-reduced-motion: reduce) {
    .success .panel, .seal path, .progress span { animation: none; }
    .seal path { stroke-dashoffset: 0; }
    .progress span { width: 100%; }
  }
`;

/**
 * Show the tap was taken: lock the button while the sign-up goes through, and
 * unlock it if the page comes back from the browser's back cache.
 */
const BUSY_SCRIPT = `
  (function () {
    var form = document.querySelector("form");
    var button = form.querySelector("button");
    var label = button.textContent;
    form.addEventListener("submit", function (event) {
      if (button.getAttribute("aria-busy") === "true") return event.preventDefault();
      button.setAttribute("aria-busy", "true");
      button.textContent = "Getting you online…";
    });
    window.addEventListener("pageshow", function () {
      button.removeAttribute("aria-busy");
      button.textContent = label;
    });
  })();
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
      <script>${BUSY_SCRIPT}</script>
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
  <meta http-equiv="refresh" content="${REDIRECT_SECONDS};url=${safe}" />
  <title>Connected · Gwenda</title>
  <style>${SHARED_STYLES}${SUCCESS_STYLES}</style>
</head>
<body>
  <main class="success">
    <img class="logo" src="/logo.png" width="512" height="320" alt="Gwenda" />
    <div class="panel">
      <div class="seal" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 12.5 9.5 18 20 6.5" /></svg>
      </div>
      <p class="eyebrow">You’re online</p>
      <h1>Connected</h1>
      <p class="lead">Taking you to <a href="${safe}">gwenda.co.uk</a></p>
      <div class="progress" aria-hidden="true"><span></span></div>
    </div>
  </main>
</body>
</html>`;
}
