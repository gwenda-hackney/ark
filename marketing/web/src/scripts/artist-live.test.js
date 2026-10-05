/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { applyLiveArtist } from "./artist-live.js";

function page(builtSlug) {
  document.title = "Rita Matos · Gwenda";
  document.body.innerHTML = `
    <header>
      <nav class="site-header-bar">
        <a href="/">Home</a>
        <a href="#at-gwenda">At Gwenda</a>
        <a href="#work">More</a>
      </nav>
    </header>
    <div class="site-nav-group site-nav-group--page">
      <a href="#at-gwenda">At Gwenda</a>
    </div>
    <div class="artist-live" data-artist-live="${builtSlug}" data-fallback-title="Featured artist · Gwenda">
      <h1 class="page-header-title">Rita Matos</h1>
      <section id="at-gwenda"></section>
      <section id="work"></section>
    </div>
    <template data-artist-waiting>
      <header class="page-header"><h1 class="page-header-title">Featured artist</h1></header>
      <p class="artist-lead artist-waiting">The next artist will hang here.</p>
    </template>
    <template data-artist-intro>
      <header class="artist-intro">
        <figure data-artist-portrait><img src="" alt="" /></figure>
        <div class="artist-intro-copy">
          <header class="page-header page-header--beside"><h1 class="page-header-title"></h1></header>
          <p data-artist-lead></p>
          <p data-artist-site><a href=""></a></p>
        </div>
      </header>
    </template>
  `;
  return document.querySelector("[data-artist-live]");
}

describe("applyLiveArtist", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("leaves the built page alone while it is still right", () => {
    const root = page("rita-matos");
    expect(
      applyLiveArtist(root, { slug: "rita-matos", name: "Rita Matos" }),
    ).toBe(false);
    expect(root.querySelector("#at-gwenda")).not.toBeNull();
  });

  it("shows the waiting page once nobody is on the wall", () => {
    const root = page("rita-matos");
    expect(applyLiveArtist(root, null)).toBe(true);
    expect(root.querySelector(".page-header-title")?.textContent).toBe(
      "Featured artist",
    );
    expect(root.querySelector(".artist-waiting")).not.toBeNull();
    expect(document.title).toBe("Featured artist · Gwenda");
    expect(document.querySelectorAll('a[href^="#"]')).toHaveLength(0);
    expect(document.querySelector(".site-nav-group--page")).toBeNull();
    expect(
      document.querySelector('.site-header-bar a[href="/"]'),
    ).not.toBeNull();
  });

  it("introduces a new artist the build has not caught up with", () => {
    const root = page("rita-matos");
    applyLiveArtist(root, {
      slug: "ana-lima",
      name: "Ana Lima",
      profile: "Paints the canal.",
      website: "https://www.analima.example/",
      portrait: "",
    });
    expect(root.querySelector(".page-header-title")?.textContent).toBe(
      "Ana Lima",
    );
    expect(root.querySelector("[data-artist-lead]")?.textContent).toBe(
      "Paints the canal.",
    );
    expect(root.querySelector("[data-artist-site] a")?.textContent).toBe(
      "analima.example",
    );
    expect(root.querySelector("[data-artist-portrait]")).toBeNull();
    expect(
      root.querySelector(".artist-intro")?.classList.contains("is-plain"),
    ).toBe(true);
    expect(root.querySelector(".page-header--beside")).toBeNull();
    expect(document.title).toBe("Ana Lima · Gwenda");
  });

  it("brings an artist back onto a page built while the wall was empty", () => {
    const root = page("");
    expect(
      applyLiveArtist(root, {
        slug: "ana-lima",
        name: "Ana Lima",
        portrait: "https://x.example/p.jpg",
      }),
    ).toBe(true);
    expect(
      root.querySelector("[data-artist-portrait] img")?.getAttribute("src"),
    ).toBe("https://x.example/p.jpg");
    expect(root.dataset.artistLive).toBe("ana-lima");
  });
});
