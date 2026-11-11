/**
 * The record with the logo's skull (#240), drawn inline wherever the site
 * uses it: ChartRecord.astro in the build, and the event pages filled in on
 * request (event-page.js). One drawing, the site icon's
 * (chart-record-drawings.js), on no board, so it sits on whatever is behind
 * it. It has no size of its own: the place it sits in sizes it with CSS.
 */
import { RECORD_DRAWINGS } from "./chart-record-drawings.js";

const attr = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

/**
 * The record as an inline <svg>. Decorative (hidden from screen readers)
 * unless it is given a label, when it is a picture by that name.
 *
 * @param {object} [options]
 * @param {"small" | "large"} [options.size] small: the tab's drawing, on
 *   whole pixels at 32, for a mark of 20 to 40px; large: the home-screen
 *   icon's, with its grooves, for a frame.
 * @param {string} [options.label]
 * @param {string} [options.className] the place's own class, beside ch-record
 */
export function recordSvg({ size = "small", label = "", className = "" } = {}) {
  const drawing = RECORD_DRAWINGS[size];
  if (!drawing) throw new Error(`No record drawn at "${size}"`);
  const named = label
    ? `role="img" aria-label="${attr(label)}"`
    : 'aria-hidden="true"';
  const classes = ["ch-record", className].filter(Boolean).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${drawing.viewBox}" class="${attr(classes)}" ${named} focusable="false">${drawing.body}</svg>`;
}
