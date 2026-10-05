/**
 * Which features each ops API path writes, for the write freeze (#191,
 * shared/write-freeze.js). A write to a frozen feature is refused with 423.
 * Paths that write several features list them all; anything not listed
 * (config, auth, deploy status) is never frozen.
 */
import { featuresForPath } from "../../../../shared/write-freeze.js";

/** @type {[RegExp, string[]][]} */
export const OPS_WRITE_FEATURES = [
  [/^\/api\/events(\/|$)/, ["events"]],
  [/^\/api\/(menu|pos-menus|inventory|suppliers)(\/|$)/, ["menu"]],
  [/^\/api\/artists(\/|$)/, ["artists"]],
  [/^\/api\/users(\/|$)/, ["users"]],
  // Approving an application updates the guest artist and can link it to a series.
  [/^\/api\/forms(\/|$)/, ["guests", "artists", "events"]],
  // Staging and publishing the website write events' and menu items' publish state.
  [/^\/api\/web\/(release|update|tick|jobs)(\/|$)/, ["events", "menu"]],
];

export function opsWriteFeatures(pathname) {
  return featuresForPath(pathname, OPS_WRITE_FEATURES);
}
