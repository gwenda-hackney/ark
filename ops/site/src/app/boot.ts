/**
 * The splash in index.html (#boot) and what happens around it: check the
 * session before the app mounts, and send anyone signed out to the gate
 * without ever showing the empty app (#153).
 */

export type BootAction = "mount" | "gate" | "forbidden" | "retry";

/** Error code the server sends with a 403 for an account not on the users list. */
export const NOT_OPS_USER = "not_ops_user";

/** What to do with the answer from /api/auth/me. */
export function bootAction(res: { status: number; type?: string }): BootAction {
  // Requests use redirect: "manual"; a redirect means the middleware sent us to the gate.
  if (res.type === "opaqueredirect" || res.status === 0 || res.status === 401) {
    return "gate";
  }
  if (res.status >= 300 && res.status < 400) return "gate";
  if (res.status === 403) return "forbidden";
  if (res.status >= 200 && res.status < 300) return "mount";
  return "retry";
}

/** Same shape as gateRedirectPath on the server: no `next` for home. */
export function gatePath(pathname: string, search = ""): string {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (path === "/" && !search) return "/gate/";
  return `/gate/?next=${encodeURIComponent(path + search)}`;
}

function splash(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.getElementById("boot");
}

let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Cover the app with the splash again (signing out, session gone). */
export function showSplash(): void {
  const el = splash();
  if (!el) return;
  clearTimeout(hideTimer);
  el.hidden = false;
  el.classList.remove("boot-out");
}

/** Fade the splash out once the app has mounted. */
export function hideSplash(): void {
  const el = splash();
  if (!el) return;
  el.classList.add("boot-out");
  clearTimeout(hideTimer);
  // Matches the fade in index.html; the timer also covers reduced motion.
  hideTimer = setTimeout(() => {
    el.hidden = true;
  }, 160);
}

/** Show a message with one link on the splash, and stop the pulse. */
function showMessage(kind: "forbidden" | "retry"): void {
  showSplash();
  const el = splash();
  if (!el) return;
  el.classList.add("boot-still");
  for (const msg of el.querySelectorAll<HTMLElement>("[data-boot-msg]")) {
    msg.hidden = msg.dataset.bootMsg !== kind;
  }
}

let leaving = false;

/** Session missing or expired: splash, then the gate, back here after. */
export function goToGate(): void {
  showSplash();
  if (leaving) return;
  leaving = true;
  location.replace(gatePath(location.pathname, location.search));
}

/** Signed in, but not on the ops users list. */
export function showForbidden(): void {
  showMessage("forbidden");
}

export function showRetry(): void {
  showMessage("retry");
}

/** A request that never settles: the page is on its way to the gate. */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** A page restored from the back-forward cache may be signed out by now. */
export function onBackForwardRestore(check: () => void): void {
  if (typeof window === "undefined") return;
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    leaving = false;
    check();
  });
}
