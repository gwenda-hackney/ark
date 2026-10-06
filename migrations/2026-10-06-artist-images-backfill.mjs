/**
 * Artist photos from before #183 move to Sanity, where ops now keeps them: a
 * portrait still kept as a Baserow file gets its Portrait asset, and art and
 * Gwenda photos still kept as files get their Art assets / Gwenda assets
 * list, in the same order, each named as it was.
 *
 * A photo already in Sanity under the name this gives it ("artist-<file
 * name>") is reused, so a run that stopped halfway doesn't upload twice.
 * The Baserow files stay until the cleanup removes their columns, and no
 * Sanity asset is ever deleted. After the ops deploy, so ops reads the new
 * fields. Safe to run again: it only touches what hasn't moved yet. Supports
 * --dry-run (with --only).
 */
import { parseArtistAssets } from "../shared/artists.js";
import { parseImageAssetId } from "../shared/sanity-image.js";

export const app = "ops";
export const phase = "post";
export const about =
  "Artist photos from before #183: Baserow files into Sanity, asset ids on the row";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function filesOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((file) => ({
      name: text(file?.name),
      label: text(file?.visible_name) || text(file?.name),
      url: text(file?.url),
    }))
    .filter((file) => file.name && file.url);
}

/** What still has to move, from rows of the ops "Artists" table. */
export function planArtistBackfill(rows) {
  const plan = [];
  for (const row of rows) {
    const columns = {};
    const portrait = filesOf(row.Portrait)[0];
    if (portrait && !parseImageAssetId(text(row["Portrait asset"])))
      columns["Portrait asset"] = [portrait];
    for (const [assets, files] of [
      ["Art assets", "Art"],
      ["Gwenda assets", "Gwenda photos"],
    ]) {
      // An empty list column hasn't moved; "[]" has, with no photos.
      if (parseArtistAssets(row[assets])) continue;
      columns[assets] = filesOf(row[files]);
    }
    const photos = Object.values(columns).reduce(
      (sum, list) => sum + list.length,
      0,
    );
    if (Object.keys(columns).length)
      plan.push({ id: row.id, name: text(row.Name), columns, photos });
  }
  return plan;
}

/** The Sanity name a photo from a Baserow file gets. */
const assetName = (file) => `artist-${file.name}`;

export async function up({ database, sanity, log, dryRun = false }) {
  const ops = await database("ops");
  const plan = planArtistBackfill(await ops.rows("Artists"));
  const photos = plan.reduce((sum, item) => sum + item.photos, 0);
  log(`${ops.label}: ${plan.length} artists, ${photos} photos to move`);
  if (!plan.length) return;

  const content = sanity();
  const files = plan.flatMap((item) => Object.values(item.columns).flat());
  const names = [...new Set(files.map(assetName))];
  const known = new Map();
  for (const row of names.length
    ? await content.query(
        `*[_type == "sanity.imageAsset" && originalFilename in $names]{ _id, originalFilename }`,
        {
          names,
        },
      )
    : []) {
    known.set(row.originalFilename, row._id);
  }
  async function assetFor(file) {
    const name = assetName(file);
    if (known.has(name)) return known.get(name);
    if (dryRun) return "";
    const res = await fetch(file.url);
    if (!res.ok)
      throw new Error(
        `could not read ${file.name} from Baserow (${res.status})`,
      );
    const asset = await content.uploadImage(await res.arrayBuffer(), {
      filename: name,
      contentType: res.headers.get("content-type") || "image/jpeg",
    });
    if (!parseImageAssetId(asset?._id))
      throw new Error(`Sanity didn't take ${file.name}`);
    known.set(name, asset._id);
    return asset._id;
  }

  const updates = [];
  const failures = [];
  for (const item of plan) {
    try {
      const update = { id: item.id };
      let found = 0;
      for (const [column, list] of Object.entries(item.columns)) {
        const moved = [];
        for (const file of list) {
          if (known.has(assetName(file))) found += 1;
          moved.push({ asset: await assetFor(file), label: file.label });
        }
        update[column] =
          column === "Portrait asset"
            ? moved[0].asset
            : JSON.stringify(moved.filter((entry) => entry.asset));
      }
      log(
        `  ${item.name}: ${item.photos} photo${item.photos === 1 ? "" : "s"}, ${found} found in Sanity`,
      );
      if (!dryRun) updates.push(update);
    } catch (error) {
      failures.push(`${item.name}: ${error.message}`);
    }
  }
  if (!dryRun) await ops.updateRows("Artists", updates);

  if (failures.length) {
    throw new Error(
      `Some artist photos didn't move (run again to retry):\n  ${failures.join("\n  ")}`,
    );
  }
}
