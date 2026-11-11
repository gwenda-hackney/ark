/**
 * The site's small line drawings (#240), each drawn once and used wherever
 * it appears: the compass rose on the menu panel (ChartNav) and on Find us's
 * badge, the logo's bottle on Having a party?'s (chart-badge.js). The record
 * has its own module (chart-record.js), drawn from the site icon.
 *
 * Each is a line in a 24 box at its own weight, in currentColor (one part
 * filled), so the place it sits in colours it. No size of its own either.
 */

export const DRAWINGS = {
  /** The compass rose: a ring, the four points, the needle, its north filled */
  compass: {
    viewBox: "0 0 24 24",
    strokeWidth: 1.2,
    body: '<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="1.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M12 5.6l1.8 5.2L12 18.4l-1.8-7.6z"/><path d="M12 5.6l1.8 5.2H10.2z" fill="currentColor"/><path d="M5.6 12l5.2-1.8 7.6 1.8-7.6 1.8z"/>',
  },
  /**
   * The logo's bottle: a square body and a wide screw neck, upright (the
   * badge tips it to pour). A STAND-IN, drawn for the badge mock-ups, until
   * the logo's own bottle is drawn as proper artwork: then it replaces this
   * body, in this one place.
   */
  bottle: {
    viewBox: "0 0 24 24",
    strokeWidth: 1.55,
    body: '<path d="M8.4 10.4h7.2a2 2 0 0 1 2 2v6.6a2 2 0 0 1-2 2H8.4a2 2 0 0 1-2-2v-6.6a2 2 0 0 1 2-2z"/><path d="M9.4 10.4V4.6h5.2v5.8M9.4 6.5h5.2M9.4 8.4h5.2"/>',
  },
};

/** One of DRAWINGS, by name, or an error naming what was asked for. */
export function drawing(name) {
  if (!Object.hasOwn(DRAWINGS, name))
    throw new Error(`No drawing called "${name}"`);
  return DRAWINGS[name];
}

/**
 * The line's own attributes: no fill, the place's colour, its weight, round
 * ends and corners. For the drawing's <svg>, or a <g> it is set in.
 */
export function lineAttrs({ strokeWidth }) {
  return `fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
}

/**
 * A drawing on its own as an inline <svg>, decorative (hidden from screen
 * readers), sized and coloured by the place's CSS.
 *
 * @param {string} name a key of DRAWINGS
 * @param {object} [options]
 * @param {string} [options.className] the place's class
 */
export function drawingSvg(name, { className = "" } = {}) {
  const art = drawing(name);
  const classes = className
    ? ` class="${className.replace(/"/g, "&quot;")}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${art.viewBox}"${classes} ${lineAttrs(art)} aria-hidden="true" focusable="false">${art.body}</svg>`;
}
