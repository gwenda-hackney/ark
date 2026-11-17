/**
 * The pictures drawn from the bottle logo's master SVG (#320), so that every
 * place the logo shows is the same drawing: the 1080 posts, the website's own
 * files and the logo at the top of every email.
 *
 * `npm run brand:logo` (scripts/trace-logo.mjs) draws them once and they are
 * committed like any other asset. Nothing here runs when the site is built or
 * deployed: when a master changes, run it again and commit what it writes.
 * scripts/trace-logo.test.mjs fails while a committed file is not its
 * master's drawing.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
import { COLOURS } from "../../shared/email/shell.js";

/** Instagram's square, and the art's longest side in it. */
const POST = 1080;
const POST_ART = 920;

/**
 * The hero's logo on home, at the widths it is drawn at: 432 is its widest
 * on the page (27rem); 864 is that at 2x, and near what a phone at 3x wants
 * (82vw); 320 and 640 are a phone's 82vw at 1x and 2x.
 */
export const HERO_LOGO_WIDTHS = [320, 432, 640, 864];

/**
 * The email's logo: this wide (shown at half that or less, so it stays sharp
 * on a phone), with this much of the board round it.
 */
const EMAIL_WIDTH = 400;
const EMAIL_PAD = 8;
/**
 * SOCIAL under the name, as home's hero sets it (styles/chart.css,
 * .ch-hero-social): the sign face in the mustard, its size a share of the
 * logo's width, tracked wide, its capitals this far under the logo.
 */
const SOCIAL = {
  text: "SOCIAL",
  size: 0.14,
  tracking: 0.37,
  gap: 0.4,
  foot: 0.28,
};
/** Text is drawn at this multiple and brought down, for clean edges. */
const TEXT_SCALE = 4;

/**
 * A master's own size in px, and where its box sits on the original's
 * canvas: its viewBox is in fractions of the original's pixels.
 */
function frame(svg) {
  const width = Number(svg.match(/<svg[^>]* width="(\d+)"/)[1]);
  const box = svg
    .match(/viewBox="([^"]*)"/)[1]
    .split(" ")
    .map(Number);
  const unit = box[2] / width;
  return { width, height: box[3] / unit, x: box[0] / unit, y: box[1] / unit };
}

/**
 * A master drawn `scale` times its own size: rasterised at twice that and
 * brought down, for clean edges.
 */
function drawn(svg, scale) {
  const { width, height } = frame(svg);
  return sharp(Buffer.from(svg), { density: 72 * 2 * scale }).resize(
    Math.round(width * scale),
    Math.round(height * scale),
    { fit: "fill" },
  );
}

/**
 * A master on the original's canvas (`canvas`, its width and height in px),
 * drawn `width` px wide, on nothing: the framing the website's files have
 * always had.
 */
async function onCanvas(svg, canvas, width) {
  const scale = width / canvas.width;
  const { x, y } = frame(svg);
  return sharp({
    create: {
      width,
      height: Math.round(canvas.height * scale),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([
    {
      input: await drawn(svg, scale).png().toBuffer(),
      left: Math.round(x * scale),
      top: Math.round(y * scale),
    },
  ]);
}

/**
 * A master as a 1080x1080 post: its art centred on a background, a colour
 * or nothing (null).
 */
export async function post(svg, background) {
  const art = await sharp(Buffer.from(svg), { density: 300 })
    .resize(POST_ART, POST_ART, { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: POST,
      height: POST,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The website's logo (src/assets/images/logos/bottle.png: the menu panel's
 * flag and the bar's logo are cut from it by astro:assets): the full master
 * at the original's size.
 */
export async function siteLogo(svg, canvas) {
  return (await onCanvas(svg, canvas, canvas.width))
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The hero's logo on home at one of HERO_LOGO_WIDTHS: the first thing a
 * visitor sees, so it must arrive first (lib/chart-assets.ts, chartHeroLogo).
 *
 * Flat inks are what a lossless encoder is good at and a lossy one spends
 * its bytes on, so it is cut to 16 colours and kept lossless, and the site
 * uses the file as it is, not through astro:assets (which can only re-encode
 * it lossy).
 */
export async function heroLogo(svg, canvas, width) {
  const quantised = await (
    await onCanvas(svg, canvas, width)
  )
    .png({ palette: true, colours: 16, effort: 10, dither: 1 })
    .toBuffer();
  return sharp(quantised).webp({ lossless: true, effort: 6 }).toBuffer();
}

/**
 * A WOFF file's font as plain TrueType: its tables unzipped and laid end to
 * end behind a table directory.
 */
export function unwoff(woff) {
  if (woff.toString("latin1", 0, 4) !== "wOFF")
    throw new Error("not a WOFF file");
  const count = woff.readUInt16BE(12);
  const head = Buffer.alloc(12 + count * 16);
  woff.copy(head, 0, 4, 8);
  head.writeUInt16BE(count, 4);
  const power = 2 ** Math.floor(Math.log2(count));
  head.writeUInt16BE(power * 16, 6);
  head.writeUInt16BE(Math.log2(power), 8);
  head.writeUInt16BE((count - power) * 16, 10);
  const parts = [head];
  let offset = head.length;
  for (let i = 0; i < count; i++) {
    const from = 44 + i * 20;
    const [at, packed, length] = [4, 8, 12].map((o) =>
      woff.readUInt32BE(from + o),
    );
    const stored = woff.subarray(at, at + packed);
    const table = packed < length ? inflateSync(stored) : stored;
    const to = 12 + i * 16;
    woff.copy(head, to, from, from + 4);
    woff.copy(head, to + 4, from + 16, from + 20);
    head.writeUInt32BE(offset, to + 8);
    head.writeUInt32BE(length, to + 12);
    const padded = Buffer.alloc(Math.ceil(length / 4) * 4);
    table.copy(padded);
    parts.push(padded);
    offset += padded.length;
  }
  return Buffer.concat(parts);
}

/**
 * SOCIAL in the sign face, Rubik Distressed, `size` px tall in the email's
 * mustard on nothing, cut to its ink.
 *
 * The site's own cut of the face is WOFF2, which sharp's text can't open; the
 * file it was cut from comes as WOFF too, with the same outlines, and that
 * opens once unwrapped to TrueType (in a folder of its own for the moment
 * the text is drawn).
 */
async function social(size) {
  const woff = createRequire(
    new URL("../../marketing/web/package.json", import.meta.url),
  ).resolve(
    "@fontsource/rubik-distressed/files/rubik-distressed-latin-400-normal.woff",
  );
  const dir = mkdtempSync(join(tmpdir(), "gwenda-sign-face-"));
  try {
    const fontfile = join(dir, "rubik-distressed.ttf");
    writeFileSync(fontfile, unwoff(readFileSync(woff)));
    // Pango's letter spacing is in 1024ths of a drawn pixel
    const spacing = Math.round(SOCIAL.tracking * size * TEXT_SCALE * 1024);
    const large = await sharp({
      text: {
        text: `<span foreground="${COLOURS.mustard}" letter_spacing="${spacing}">${SOCIAL.text}</span>`,
        font: `Rubik Distressed ${size}`,
        fontfile,
        rgba: true,
        dpi: 72 * TEXT_SCALE,
      },
    })
      .png()
      .toBuffer();
    const { width } = await sharp(large).metadata();
    return await sharp(large)
      .resize(Math.round(width / TEXT_SCALE))
      .png()
      .toBuffer();
  } finally {
    rmSync(dir, { recursive: true });
  }
}

/**
 * The logo at the top of every email (public/brand/logo-email-social.png):
 * the full master with SOCIAL under it, as home's hero shows them, on the
 * email's board.
 *
 * Flat RGB with no colour chunks, so no browser or mail app corrects it and
 * its ground stays exactly the board's colour round it (shared/email's
 * shell.test.js holds it to that).
 */
export async function emailLogo(svg, canvas) {
  const logoWidth = EMAIL_WIDTH - 2 * EMAIL_PAD;
  const logo = await (await onCanvas(svg, canvas, logoWidth)).png().toBuffer();
  const logoHeight = (await sharp(logo).metadata()).height;
  const size = SOCIAL.size * logoWidth;
  const word = await social(size);
  const { width, height } = await sharp(word).metadata();
  const top = Math.round(EMAIL_PAD + logoHeight + SOCIAL.gap * size);
  return sharp({
    create: {
      width: EMAIL_WIDTH,
      height: Math.round(top + height + SOCIAL.foot * size),
      channels: 3,
      background: COLOURS.board,
    },
  })
    .composite([
      { input: logo, left: EMAIL_PAD, top: EMAIL_PAD },
      { input: word, left: Math.round((EMAIL_WIDTH - width) / 2), top },
    ])
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
}
