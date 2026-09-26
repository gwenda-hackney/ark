/** Images embedded in outbound email (the logo travels as an inline attachment). */

/** Content-ID of the inline logo attachment, referenced as `cid:` in email HTML. */
export const LOGO_CID = "gwenda-logo@gwenda";

/** PNG/JPEG magic bytes — catches SPA fallback pages served with a 200 for a missing asset. */
function looksLikeImage(buffer, contentType) {
  if (contentType && /^image\//i.test(contentType)) return true;
  if (buffer.length < 4) return false;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  return isPng || isJpeg;
}

export async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!looksLikeImage(buffer, response.headers.get("content-type"))) return null;
    return buffer;
  } catch {
    return null;
  }
}
