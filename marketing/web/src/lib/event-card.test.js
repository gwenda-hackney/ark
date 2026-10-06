/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  diaryCardModel,
  escapeHtml,
  nightCardModel,
  renderEventCard,
  GALLERY_FIRST,
  tinyImageUrl,
  renderGallery,
  seriesCardModel,
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

  it("uses the same card on the series page", () => {
    const main = dom(
      renderEventCard(
        seriesCardModel({
          title: "Negroni Chess Society",
          nextDate: "2099-10-06",
          offer: "£8 Negroni",
          description: "Negronis, stirred slowly.",
          nightSchedule: negroni.nightSchedule,
          nights: [
            {
              date: "2099-10-06",
              artist: "Hackney Chess Club",
              pageUrl: "https://www.instagram.com/hackneychess/",
            },
          ],
          upcomingDates: [{ date: "2099-10-06" }, { date: "2099-10-13" }],
        }),
      ),
    );
    expect(main.tagName).toBe("SECTION");
    expect(main.querySelector(".event-guest a").textContent).toBe(
      "Hackney Chess Club",
    );
    // The next night leads the card; the list starts after it.
    const ahead = main.querySelectorAll(".event-dates li time");
    expect([...ahead].map((time) => time.getAttribute("datetime"))).toEqual([
      "2099-10-13",
    ]);

    const night = dom(
      renderEventCard(
        nightCardModel(
          { title: "Gwenda + Live", date: "2099-10-10", artist: "Rafa" },
          { seriesSchedule: negroni.nightSchedule },
        ),
      ),
    );
    expect(night.tagName).toBe("LI");
    expect(night.querySelector(".event-guest-name").textContent).toBe("Rafa");
    expect(night.querySelector(".night-schedule-item").textContent).toBe(
      "Chess",
    );
  });
});

describe("renderGallery", () => {
  it("lays photos out by shape and leaves out ones without a size", () => {
    const gallery = dom(
      renderGallery(
        [
          { url: "https://cdn.example/wide.jpg", width: 1600, height: 900 },
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
    expect(items[0].querySelector("img").getAttribute("src")).toBe(
      "https://cdn.example/wide.jpg?w=900&auto=format&q=86",
    );
  });

  it("renders nothing without photos", () => {
    expect(renderGallery([])).toBe("");
  });
});

describe("tinyImageUrl", () => {
  it("asks Sanity for a tiny blurred copy, keeping the crop", () => {
    const tiny = new URL(
      tinyImageUrl(
        "https://cdn.sanity.io/images/p/d/a.jpg?rect=0,0,800,500&w=1800&auto=format&q=86",
      ),
    );
    expect(tiny.searchParams.get("rect")).toBe("0,0,800,500");
    expect(tiny.searchParams.get("w")).toBe("48");
    expect(tiny.searchParams.get("blur")).toBe("30");
  });

  it("leaves other images alone", () => {
    expect(tinyImageUrl("/images/flyer.jpg")).toBe("");
    expect(tinyImageUrl("https://example.com/a.jpg")).toBe("");
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
    expect(html).toContain(
      'data-full="https://cdn.sanity.io/images/p/d/photo0-800x600.jpg?w=1800',
    );
  });

  it("no button when they all fit", () => {
    expect(renderGallery(photos(GALLERY_FIRST))).not.toContain(
      "data-gallery-more",
    );
  });
});
