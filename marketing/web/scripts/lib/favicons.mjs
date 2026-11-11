/**
 * The site's icons, drawn from the SVG sources in src/assets/images/logos/icon/
 * (#240): the record with the logo's skull on its label. Each size has the
 * drawing made for it; the PNGs and the .ico are rendered here, never by hand.
 */
import sharp from "sharp";

/** Which source draws which file in public/, and at what size. */
export const ICON_SOURCES = {
  /** Drawn on the 16px grid: no grooves, a bolder skull. */
  small: "favicon-16.svg",
  /** The tab's icon at 32 and up; also served as is, as /favicon.svg. */
  tab: "favicon.svg",
  /** The phone's home-screen icon, on the board colour. */
  app: "app-icon.svg",
};

/**
 * Render an SVG to a square PNG `size` pixels across. The SVG is rasterised
 * at exactly that size, so a drawing made on the pixel grid stays crisp.
 * With `background`, the result is flattened onto it and has no alpha (iOS
 * shows any transparency in a home-screen icon as black).
 */
export async function svgToPng(svg, size, { background } = {}) {
  const { width } = await sharp(svg).metadata();
  let image = sharp(svg, { density: (72 * size) / width }).resize(size, size, {
    fit: "fill",
  });
  if (background) image = image.flatten({ background }).removeAlpha();
  return image.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Pack square PNGs into one .ico, each kept as PNG (as every browser since
 * IE9 reads them), so no ImageMagick is needed.
 * @param {{ size: number, png: Buffer }[]} images
 */
export function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    if (size < 1 || size > 256) throw new Error(`No .ico entry at ${size}px`);
    const entry = Buffer.alloc(16);
    // 256 is written as 0
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

/** The sizes and PNG data inside an .ico: what packIco wrote, read back. */
export function readIco(ico) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => {
    const at = 6 + 16 * i;
    const length = ico.readUInt32LE(at + 8);
    const offset = ico.readUInt32LE(at + 12);
    return {
      size: ico.readUInt8(at) || 256,
      png: ico.subarray(offset, offset + length),
    };
  });
}
