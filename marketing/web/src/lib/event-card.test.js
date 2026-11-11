/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  diaryCardModel,
  escapeHtml,
  renderEventCard,
  GALLERY_FIRST,
  renderGallery,
} from "./event-card.js";

const negroni = {
  id: "negroni-night",
  seriesId: "negroni-night",
  title: "Negroni Chess Society",
  href: "/whats-on/negroni-night",
  regular: true,
  schedule: "repeating",
  scheduleLabel: "Every Tuesday",
  date: "2099-10-06",
  startTime: "16:00",
  endTime: "23:00",
  guestName: "Hackney Chess Club",
  guestUrl: "https://www.instagram.com/hackneychess/",
  pageUrl: "https://www.instagram.com/hackneychess/",
  offer: "£8 Negroni",
  nightSchedule: [{ label: "Chess", startTime: "19:00", endTime: "22:00" }],
  description: "Negronis, stirred slowly.",
  heroImageUrl: "https://cdn.example/negroni.jpg",
  nightCount: 3,
};

function dom(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

describe("renderEventCard", () => {
  it("draws a whole-image hero uncropped on its blurred copy (#27)", () => {
    const whole = dom(
      renderEventCard(
        diaryCardModel({
          ...negroni,
          heroImageUrl: "https://cdn.sanity.io/images/p/d/flyer.jpg#whole",
        }),
      ),
    );
    const media = whole.querySelector(".event-media");
    expect(media.classList.contains("event-media--whole")).toBe(true);
    expect(media.querySelector("img").getAttribute("src")).toMatch(
      /\?w=960[^#]*#whole$/,
    );
    const fill = dom(renderEventCard(diaryCardModel(negroni)));
    expect(
      fill
        .querySelector(".event-media")
        .classList.contains("event-media--whole"),
    ).toBe(false);
  });

  it("escapes every value", () => {
    expect(escapeHtml(`<b onclick="x">&'`)).toBe(
      "&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;",
    );
    const card = dom(
      renderEventCard(
        diaryCardModel({ ...negroni, title: '<img src=x onerror="1">' }),
      ),
    );
    expect(card.querySelector("img[onerror]")).toBeNull();
    expect(card.querySelector(".event-title").textContent).toBe(
      '<img src=x onerror="1">',
    );
  });

  it("links the guest's name instead of a separate page link", () => {
    const card = dom(renderEventCard(diaryCardModel(negroni)));
    const guest = card.querySelector(".event-guest a");
    expect(guest.textContent).toBe("Hackney Chess Club");
    expect(guest.getAttribute("href")).toBe(
      "https://www.instagram.com/hackneychess/",
    );
    expect(card.querySelector(".event-page-link")).toBeNull();
    // A link inside the card: the card is a div with a hit area.
    expect(card.tagName).toBe("DIV");
    expect(card.querySelector(".event-card-hit").getAttribute("href")).toBe(
      "/whats-on/negroni-night",
    );
    expect(card.querySelector(".event-date span").textContent).toBe(
      "Every Tuesday",
    );
    expect(card.querySelector(".event-more-dates")).not.toBeNull();
  });

  it("keeps a link with no guest as its own line", () => {
    const card = dom(
      renderEventCard(
        diaryCardModel({
          ...negroni,
          guestName: "",
          guestUrl: "",
          pageUrl: "https://partiful.com/e/amo",
        }),
      ),
    );
    expect(card.querySelector(".event-guest")).toBeNull();
    expect(card.querySelector(".event-page-link a").textContent).toBe(
      "Partiful",
    );
  });

  it("is a plain link card when nothing inside links out", () => {
    const card = dom(
      renderEventCard(
        diaryCardModel({ ...negroni, guestUrl: "", pageUrl: "" }),
      ),
    );
    expect(card.tagName).toBe("A");
    expect(card.querySelector(".event-guest-name").textContent).toBe(
      "Hackney Chess Club",
    );
  });
});

describe("renderGallery", () => {
  it("lays photos out by shape and leaves out ones without a size", () => {
    const gallery = dom(
      renderGallery(
        [
          {
            url: "https://cdn.sanity.io/images/p/d/wide-1600x900.jpg",
            width: 1600,
            height: 900,
          },
          { url: "https://cdn.example/tall.jpg", width: 800, height: 1000 },
          { url: "https://cdn.example/unknown.jpg", width: 0, height: 0 },
        ],
        { title: "Negroni Chess Society" },
      ),
    );
    const items = gallery.querySelectorAll(".series-gallery-item");
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute("style")).toBe("--ratio: 1.778");
    expect(items[1].querySelector("img").getAttribute("alt")).toBe(
      "Negroni Chess Society, photo 2",
    );
    // A photo in a choice of sizes, for the column it's shown in...
    const photo = items[0].querySelector("img");
    expect(photo.getAttribute("src")).toBe(
      "https://cdn.sanity.io/images/p/d/wide-1600x900.jpg?w=640&q=86&auto=format",
    );
    expect(
      photo
        .getAttribute("srcset")
        .split(", ")
        .map((candidate) => candidate.split(" ")[1]),
    ).toEqual(["160w", "320w", "480w", "640w", "960w", "1280w", "1600w"]);
    expect(photo.getAttribute("sizes")).toMatch(/^auto, /);
    // ...and one that isn't on the image CDN as it is.
    const other = items[1].querySelector("img");
    expect(other.getAttribute("src")).toBe("https://cdn.example/tall.jpg");
    expect(other.hasAttribute("srcset")).toBe(false);
    expect(other.hasAttribute("sizes")).toBe(false);
  });

  it("renders nothing without photos", () => {
    expect(renderGallery([])).toBe("");
  });
});

describe("a flyer whose address already names a size (#240)", () => {
  // As the site's data has it: the flyer, 1600px wide, to show whole.
  const flyer =
    "https://cdn.sanity.io/images/p/d/abc-1132x1600.jpg?w=1600&q=86&auto=format#whole";

  it("is on the card at the card's width", () => {
    const card = dom(
      renderEventCard(diaryCardModel({ ...negroni, heroImageUrl: flyer })),
    );
    const src = new URL(card.querySelector("img").getAttribute("src"));
    expect(src.searchParams.getAll("w")).toEqual(["960"]);
  });
});

describe("renderGallery: while photos load", () => {
  it("puts the blurred copy behind the first rows and the main colour behind every photo", () => {
    const photo = (i) => ({
      url: `https://cdn.sanity.io/images/p/d/${i}.jpg`,
      width: 1000,
      height: 800,
      lqip: "data:image/png;base64,AAAA",
      color: "#c28a64",
    });
    const html = renderGallery(
      Array.from({ length: GALLERY_FIRST + 1 }, (_, i) => photo(i)),
    );
    expect(html.match(/--lqip: url/g)).toHaveLength(GALLERY_FIRST);
    expect(html.match(/--photo-color: #c28a64/g)).toHaveLength(
      GALLERY_FIRST + 1,
    );
  });
});

describe("renderGallery: Show all", () => {
  const photos = (count) =>
    Array.from({ length: count }, (_, index) => ({
      url: `https://cdn.sanity.io/images/p/d/photo${index}-800x600.jpg`,
      width: 800,
      height: 600,
    }));

  it("shows the first rows and a Show all button for the rest", () => {
    const html = renderGallery(photos(GALLERY_FIRST + 3));
    expect(
      html.match(/<li class="series-gallery-item"[^>]* hidden/g),
    ).toHaveLength(3);
    expect(html).toContain(`Show all ${GALLERY_FIRST + 3} photos`);
    // Opened large: as big as the photo is (800px), not stretched beyond it.
    expect(html).toContain(
      'data-full="https://cdn.sanity.io/images/p/d/photo0-800x600.jpg?w=800',
    );
  });

  it("no button when they all fit", () => {
    expect(renderGallery(photos(GALLERY_FIRST))).not.toContain(
      "data-gallery-more",
    );
  });
});
