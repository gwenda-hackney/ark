/**
 * In-page URL updates must keep the view-transition history entry.
 * replaceState(null) drops `{ index, scrollX, scrollY }`. Browser back then
 * changes the address, and the router ignores the popstate because state is
 * null, so the previous page never loads.
 */

/** @param {string} url */
export function replacePageUrl(url) {
  history.replaceState(history.state, "", url);
}

/**
 * Push an entry without dropping the router's index and scroll.
 * @param {Record<string, unknown>} state
 * @param {string} [url]
 */
export function pushPageState(state, url = location.href) {
  const current =
    history.state && typeof history.state === "object" ? history.state : {};
  history.pushState({ ...current, ...state }, "", url);
}
