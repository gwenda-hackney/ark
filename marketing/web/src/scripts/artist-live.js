/**
 * /artists/current is built, so it shows whoever was on the wall at the last
 * site build. Ops changes go live through /api/featured-artist straight away;
 * this redraws the page from it until the next build catches up.
 */
import { readsLiveDiary } from "./whats-on.js";

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

/** Page menu anchors (At Gwenda, More) whose section is gone. */
function dropDeadAnchors() {
  const links = document.querySelectorAll(
    '.site-header-bar a[href^="#"], .site-nav-group--page a[href^="#"]',
  );
  for (const link of links) {
    const id = link.getAttribute("href")?.slice(1) || "";
    if (id && !document.getElementById(id)) link.remove();
  }
  for (const group of document.querySelectorAll(".site-nav-group--page")) {
    if (!group.querySelector("a")) group.remove();
  }
}

function introFor(template, artist) {
  const content = template.content.cloneNode(true);
  const header = content.querySelector(".artist-intro");
  const title = content.querySelector(".page-header-title");
  if (title) title.textContent = artist.name;

  const portrait = content.querySelector("[data-artist-portrait]");
  const img = portrait?.querySelector("img");
  if (artist.portrait && img) {
    img.src = artist.portrait;
  } else {
    portrait?.remove();
    header?.classList.add("is-plain");
    content
      .querySelector(".page-header")
      ?.classList.remove("page-header--beside");
  }

  const lead = content.querySelector("[data-artist-lead]");
  if (artist.profile && lead) lead.textContent = artist.profile;
  else lead?.remove();

  const site = content.querySelector("[data-artist-site]");
  const link = site?.querySelector("a");
  if (artist.website && link) {
    link.href = artist.website;
    link.textContent = hostLabel(artist.website);
  } else {
    site?.remove();
  }
  return content;
}

/**
 * Swap the built wall page when ops has a different current artist, or none.
 * Returns whether it changed anything.
 */
export function applyLiveArtist(root, artist) {
  if (!(root instanceof HTMLElement)) return false;
  const live = artist?.name ? String(artist.slug || "") : "";
  if (live === (root.dataset.artistLive || "")) return false;

  const template = document.querySelector(
    artist?.name
      ? "template[data-artist-intro]"
      : "template[data-artist-waiting]",
  );
  if (!(template instanceof HTMLTemplateElement)) return false;
  root.replaceChildren(
    artist?.name
      ? introFor(template, artist)
      : template.content.cloneNode(true),
  );
  root.dataset.artistLive = live;
  document.title = artist?.name
    ? `${artist.name} · Gwenda`
    : root.dataset.fallbackTitle || document.title;
  dropDeadAnchors();
  return true;
}

/** @type {AbortController | null} */
let artistLiveAbort = null;

export function initArtistLive() {
  const root = document.querySelector("[data-artist-live]");
  if (!(root instanceof HTMLElement)) return;
  if (!readsLiveDiary(document.documentElement?.dataset?.siteEnv || "")) return;

  artistLiveAbort?.abort();
  artistLiveAbort = new AbortController();
  const { signal } = artistLiveAbort;

  void fetch("/api/featured-artist", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`Featured artist failed (${res.status})`);
      return res.json();
    })
    .then((data) => {
      if (signal.aborted || !document.contains(root)) return;
      applyLiveArtist(root, data.artist);
    })
    .catch((error) => {
      if (signal.aborted || error?.name === "AbortError") return;
    });
}
