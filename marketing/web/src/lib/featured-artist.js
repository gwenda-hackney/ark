/**
 * The artist on the wall, read from Ops Baserow.
 * Marketing's own Baserow token cannot see that database, so this uses
 * BASEROW_OPS_API_KEY (filled from .env.ops by with-env when present).
 */
import { listArtists } from "../../../../ops/site/functions/_lib/artist-store.js";
import { artistRunLabel } from "./artist-run.js";

function text(value) {
  return String(value || "").trim();
}

export function opsArtistEnv(env = process.env) {
  const key = text(env.BASEROW_OPS_API_KEY);
  const databaseId = text(env.BASEROW_OPS_DATABASE_ID);
  if (!key || !databaseId) return null;
  return {
    BASEROW_API_KEY: key,
    BASEROW_API_URL: env.BASEROW_API_URL,
    BASEROW_OPS_DATABASE_ID: databaseId,
  };
}

function imageUrl(file) {
  return text(file?.url);
}

function imageLabel(file) {
  return text(file?.label).replace(/\.[a-z0-9]+$/i, "");
}

function publicImages(files) {
  return (files || [])
    .map((file) => {
      const url = imageUrl(file);
      if (!url) return null;
      return { url, label: imageLabel(file) };
    })
    .filter(Boolean);
}

const RESERVED_ARTIST_SLUGS = new Set(["current", "next"]);

/** Public path segment. `current` and `next` stay reserved for the live pages. */
export function slugifyArtistName(name) {
  return text(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Stable slugs from the name. A clash, or a reserved word, takes the row id. */
export function withArtistSlugs(artists) {
  const list = Array.isArray(artists) ? artists : [];
  const used = new Set(RESERVED_ARTIST_SLUGS);
  return list.map((artist) => {
    if (!artist || !text(artist.name)) return artist;
    const base = slugifyArtistName(artist.name) || "artist";
    let slug = base;
    if (used.has(slug)) {
      const id = text(artist.id) || "2";
      slug = `${base}-${id}`;
      let n = 2;
      while (used.has(slug)) {
        slug = `${base}-${id}-${n}`;
        n += 1;
      }
    }
    used.add(slug);
    return { ...artist, slug };
  });
}

/** `/artists/current` while they hold the wall. Archive pages keep the name slug. */
export function artistPagePath(artist) {
  if (artist?.slot === "current") return "/artists/current";
  const slug = text(artist?.slug);
  if (!slug || RESERVED_ARTIST_SLUGS.has(slug)) return "";
  return `/artists/${slug}`;
}

/** Short name for "From {name}". Uses Artist name, or the first word of the full name. */
export function artistShortName(artist) {
  const given = text(artist?.artistName);
  if (given) return given;
  return text(artist?.name).split(/\s+/)[0] || "";
}

export function publicArtist(artist) {
  if (!artist || !text(artist.name)) return null;
  return {
    name: text(artist.name),
    artistName: artistShortName(artist),
    website: text(artist.website),
    profile: text(artist.profile),
    bio: text(artist.bio),
    portrait: imageUrl(artist.portrait),
    art: publicImages(artist.art),
    gwenda: publicImages(artist.gwenda),
    slug: text(artist.slug),
    slot: text(artist.slot),
    startMonth: text(artist.startMonth),
    endMonth: text(artist.endMonth),
    runLabel: artistRunLabel(artist.startMonth, artist.endMonth),
  };
}

export function featuredFromArtists(artists) {
  const list = withArtistSlugs(Array.isArray(artists) ? artists : []);
  const publish = (artist) => publicArtist(artist);
  return {
    current: publish(list.find((artist) => artist?.slot === "current")),
    next: publish(list.find((artist) => artist?.slot === "next")),
    previous: list
      .filter((artist) => artist?.slot === "previous")
      .map(publish)
      .filter(Boolean),
  };
}

export function bioParagraphs(bio) {
  return text(bio)
    .split(/\n{2,}|\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function websiteLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return text(url);
  }
}

export async function fetchFeaturedArtists(env = process.env) {
  const readEnv = opsArtistEnv(env);
  if (!readEnv) return { current: null, next: null, previous: [] };
  try {
    return featuredFromArtists(await listArtists(readEnv));
  } catch (error) {
    console.warn(
      "Featured artist unavailable:",
      error instanceof Error ? error.message : error,
    );
    return { current: null, next: null, previous: [] };
  }
}
