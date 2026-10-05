/**
 * Sanity image asset ids and their CDN addresses (#183). Ops keeps only the
 * asset id ("image-<sha1>-<w>x<h>-<ext>"): it is a hash of the bytes, the same
 * in the dev and production projects, so the address is built per project.
 */
const ASSET_ID = /^image-([a-f0-9]+)-(\d+)x(\d+)-([a-z0-9]+)$/i;

/** { sha1, width, height, ext } for a Sanity image asset id, or null. */
export function parseImageAssetId(id) {
  const match = ASSET_ID.exec(String(id ?? "").trim());
  if (!match) return null;
  return {
    sha1: match[1],
    width: Number(match[2]),
    height: Number(match[3]),
    ext: match[4].toLowerCase(),
  };
}

/** cdn.sanity.io address for an asset id, with optional image parameters. */
export function sanityImageUrl(projectId, assetId, params = {}, dataset = "production") {
  const parsed = parseImageAssetId(assetId);
  if (!parsed || !projectId) return "";
  const url = new URL(
    `https://cdn.sanity.io/images/${projectId}/${dataset}/${parsed.sha1}-${parsed.width}x${parsed.height}.${parsed.ext}`,
  );
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}
