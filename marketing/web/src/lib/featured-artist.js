/**
 * The artist on the wall, read from Ops Baserow.
 * Marketing's own Baserow token cannot see that database, so this uses
 * BASEROW_OPS_API_KEY (filled from .env.ops by with-env when present).
 */
import { listArtists } from "../../../../ops/site/functions/_lib/artist-store.js";

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

export function publicArtist(artist) {
  if (!artist || !text(artist.name)) return null;
  return {
    name: text(artist.name),
    website: text(artist.website),
    profile: text(artist.profile),
    bio: text(artist.bio),
    portrait: imageUrl(artist.portrait),
    art: publicImages(artist.art),
    gwenda: publicImages(artist.gwenda),
  };
}

export function featuredFromArtists(artists) {
  const list = Array.isArray(artists) ? artists : [];
  return {
    current: publicArtist(list.find((artist) => artist?.slot === "current")),
    next: publicArtist(list.find((artist) => artist?.slot === "next")),
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
  if (!readEnv) return { current: null, next: null };
  try {
    return featuredFromArtists(await listArtists(readEnv));
  } catch (error) {
    console.warn(
      "Featured artist unavailable:",
      error instanceof Error ? error.message : error,
    );
    return { current: null, next: null };
  }
}
