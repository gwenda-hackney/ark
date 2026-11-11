/**
 * The badges (#240): one round frame with a drawing in it, sitting where a
 * section's trail starts, the trail running on from it, like a stop on a
 * treasure map (.ch-waypoint in chart-rules.css). Find us is the compass,
 * Having a party? the logo's bottle, Play at Gwenda the record. The buttons
 * and links stay plain words. Drawn inline by ChartBadge.astro.
 *
 * The frame is the record's own rim (a light line, then a dark one) round a
 * face, the drawing on the face, so the compass and the bottle are of the
 * record's family; the record is its own frame (chart-record.js). The
 * frame's colours are custom properties in chart-badge.css, never here, so
 * when the record is redrawn the frame follows it with one change there.
 *
 * Always decorative: the heading beside it carries the meaning.
 */
import { drawing, lineAttrs } from "./chart-drawings.js";
import { recordSvg } from "./chart-record.js";

/**
 * Where each drawing sits on the frame's face, in its 32 box: the compass
 * a size up, its ring just inside the rim; the bottle tipped to pour.
 */
const ON_FACE = {
  compass: "translate(16 16) scale(1.2) translate(-12 -12)",
  bottle: "translate(16.6 16.8) rotate(-35) translate(-12 -12.6)",
};

/** The kinds of badge, for ChartBadge's `kind`. */
export const BADGE_KINDS = ["record", ...Object.keys(ON_FACE)];

/** The frame, outside in: chart-badge.css colours each ring by its class */
const FRAME = [
  ["ch-badge-rim", 16],
  ["ch-badge-ring", 15],
  ["ch-badge-face", 14],
]
  .map(([part, r]) => `<circle class="${part}" cx="16" cy="16" r="${r}"/>`)
  .join("");

/**
 * A badge as an inline <svg>, decorative, with no size of its own: the
 * place it sits in sizes it.
 *
 * @param {"record" | "compass" | "bottle"} kind
 * @param {object} [options]
 * @param {string} [options.className] the place's own class, beside ch-badge
 */
export function badgeSvg(kind, { className = "" } = {}) {
  const classes = ["ch-badge", `ch-badge--${kind}`, className]
    .filter(Boolean)
    .join(" ");
  if (kind === "record") return recordSvg({ className: classes });
  if (!Object.hasOwn(ON_FACE, kind))
    throw new Error(`No badge of the kind "${kind}"`);
  const art = drawing(kind);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="${classes.replace(/"/g, "&quot;")}" aria-hidden="true" focusable="false">${FRAME}<g class="ch-badge-ink" transform="${ON_FACE[kind]}" ${lineAttrs(art)}>${art.body}</g></svg>`;
}
