import { describe, expect, it } from "vitest";
import { CHART_SECTIONS } from "./chart-nav.js";
import { FOOT_LINKS, PRIVACY_LINK } from "./chart-footer.js";
import { nightsStructuredData, siteNavigation } from "./structured-data.js";

const DOMAIN = "https://gwenda.co.uk";

describe("the navigation search engines read", () => {
  const list = siteNavigation(DOMAIN);

  it("is the site's own: the five places, then the foot's", () => {
    const links = [...CHART_SECTIONS, ...FOOT_LINKS, PRIVACY_LINK];
    expect(
      list.itemListElement.map(({ name, url }) => ({ name, url })),
    ).toEqual(
      links.map((link) => ({
        name: link.label,
        // Each page's own address, as its canonical link gives it
        url: `${DOMAIN}${link.href}/`,
      })),
    );
    expect(list.itemListElement.map((item) => item.url)).toContain(
      `${DOMAIN}/bookings/`,
    );
  });

  it("numbers them in order", () => {
    expect(list.itemListElement.map((item) => item.position)).toEqual(
      list.itemListElement.map((_item, index) => index + 1),
    );
    expect(list["@id"]).toBe(`${DOMAIN}/#navigation`);
  });

  it("has nothing of the old menu", () => {
    const names = list.itemListElement.map((item) => item.name);
    for (const old of ["Behind the doors", "Menu", "Featured artist"]) {
      expect(names).not.toContain(old);
    }
    expect(list.itemListElement.map((item) => item.url).join(" ")).not.toMatch(
      /#story|#list|\/menu/,
    );
  });
});

describe("the nights search engines read", () => {
  const venue = {
    name: "Gwenda",
    domain: DOMAIN,
    location: {
      streetAddress: "Unit 4003, 4 Schwartz Wharf",
      addressLocality: "London",
      postalCode: "E9 5AA",
    },
  };

  it("lists each night as an event at the venue", () => {
    const [event] = nightsStructuredData(
      [
        {
          title: "Negroni & Chess",
          date: "2099-01-06",
          description: "Bring a **board**.",
          artist: "Ada",
        },
      ],
      venue,
    );
    expect(event).toMatchObject({
      "@type": "Event",
      name: "Negroni & Chess",
      startDate: "2099-01-06",
      description: "Bring a board.",
      performer: { "@type": "Person", name: "Ada" },
      eventStatus: "https://schema.org/EventScheduled",
      location: {
        "@type": "Place",
        name: "Gwenda",
        address: { postalCode: "E9 5AA" },
      },
      organizer: { name: "Gwenda", url: DOMAIN },
    });
  });

  it("names no performer for a night without one", () => {
    const [event] = nightsStructuredData(
      [{ title: "Quiz", date: "2099-01-07", description: "" }],
      venue,
    );
    expect(event).not.toHaveProperty("performer");
  });
});
