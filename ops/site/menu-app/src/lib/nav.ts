import {
  canonicalizePath,
  editorClosePath,
  editorReturnTo,
  isClientNavPath,
  shouldReplaceNav,
  stripTrailingSlash,
} from "../../../functions/_lib/spa-path.js";

export {
  canonicalizePath,
  editorClosePath,
  editorKey,
  editorReturnTo,
  eventItemPath,
  eventListPath,
  eventNewPath,
  eventTabPath,
  itemSlug,
  itemMatchesKey,
  inventoryItemPath,
  inventoryListPath,
  inventoryNewPath,
  isClientNavPath,
  isEditorPath,
  isSpaDocumentPath,
  menuItemPath,
  menuItemPrintPath,
  menuListPath,
  menuNewPath,
  menuPrintPath,
  menuTabPath,
  namesClash,
  navigationLeavesEditor,
  normalizeEventTab,
  normalizeMenuTab,
  parseShellPath,
  shellCrumbs,
  shellPageKey,
  shouldReplaceNav,
  stripTrailingSlash,
} from "../../../functions/_lib/spa-path.js";

import {
  rememberBlockedNav,
  shouldBlockNavigation,
} from "./unsaved.svelte";

const NAV_EVENT = "ops:navigate";

type NavState = { path?: string; returnTo?: string };

function readNavState(): NavState {
  const state = typeof history === "undefined" ? null : history.state;
  if (state && typeof state === "object") return state as NavState;
  return {};
}

/** Pathname as the shell sees it (hash routes fold into the path). */
export function readPath(): string {
  if (typeof location === "undefined") return "/";
  const path = stripTrailingSlash(location.pathname) || "/";
  const hash = location.hash.replace(/^#/, "");
  if (path === "/" && hash.startsWith("/")) {
    return stripTrailingSlash(hash.split("?")[0] || "/") || "/";
  }
  return path;
}

export function syncCanonicalUrl(): string {
  if (typeof history === "undefined") return "/";
  const path = readPath();
  const search = location.search || "";
  if (location.pathname !== path || location.hash) {
    history.replaceState(history.state, "", path + search);
  }
  return path;
}

export function navigate(
  path: string,
  opts: { replace?: boolean; force?: boolean } = {},
): void {
  if (typeof history === "undefined") return;
  const next = canonicalizePath(path.startsWith("/") ? path : `/${path}`);
  const fromPath = readPath();
  const replace = Boolean(opts.replace) || shouldReplaceNav(fromPath, next);
  const current = `${stripTrailingSlash(location.pathname) || "/"}${location.search || ""}`;
  if (shouldBlockNavigation(fromPath, next, opts.force)) {
    rememberBlockedNav(next, replace);
    return;
  }
  const returnTo = editorReturnTo(fromPath, next, readNavState().returnTo);
  const state: NavState = returnTo ? { path: next, returnTo } : { path: next };
  if (replace || current !== next) {
    if (replace) history.replaceState(state, "", next);
    else history.pushState(state, "", next);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Dismiss an editor to the page that opened it, or `fallback` on a direct load. */
export function leaveEditor(
  fallback: string,
  opts: { force?: boolean } = {},
): void {
  navigate(editorClosePath(readPath(), readNavState().returnTo, fallback), {
    ...opts,
    replace: true,
  });
}

export function listen(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onPop = () => onChange();
  window.addEventListener("popstate", onPop);
  window.addEventListener(NAV_EVENT, onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    window.removeEventListener(NAV_EVENT, onPop);
  };
}

export function loginNext(fallback = "/menu"): string {
  const path = readPath();
  return path === "/" ? fallback : path;
}

/** Same-origin left-clicks on shell routes stay in the SPA. */
export function interceptClientNav(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const anchor = target.closest("a");
  if (!anchor || anchor.hasAttribute("download")) return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;
  if (anchor.target && anchor.target !== "_self") return;
  let url: URL;
  try {
    url = new URL(anchor.href, location.origin);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  if (!isClientNavPath(url.pathname)) return;
  event.preventDefault();
  navigate(`${stripTrailingSlash(url.pathname) || "/"}${url.search}`);
}
