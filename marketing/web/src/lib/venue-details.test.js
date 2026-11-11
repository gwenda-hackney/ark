import { describe, expect, it } from "vitest";
import { VENUE_DETAILS_QUERY, readVenueDetails } from "./venue-details.js";

/**
 * What VENUE_DETAILS_QUERY returns. Running the query on what ops writes is
 * ops' contract test (ops/site/src/venue/server/venue-website.website.contract.test.js).
 */
const WEEK = [
  { day: "mon", closed: true },
  ...["tue", "wed", "thu", "fri", "sat", "sun"].map((day) => ({
    day,
    closed: false,
    opens: "17:00",
    closes: "22:00",
  })),
];

describe("venue details, in one query", () => {
  it("asks for the one document's week and party facts", () => {
    expect(VENUE_DETAILS_QUERY).toMatch(/_id == "venueDetails"/);
    expect(VENUE_DETAILS_QUERY).toMatch(/openingHours/);
    expect(VENUE_DETAILS_QUERY).toMatch(/parties/);
  });

  it("reads the week and the party facts", () => {
    const details = readVenueDetails({
      openingHours: WEEK,
      parties: { standing: 80, replyWithin: "a day" },
    });
    expect(details.openingHours).toHaveLength(7);
    expect(details.openingHours[0]).toEqual({
      day: "mon",
      closed: true,
      opens: "",
      closes: "",
    });
    expect(details.parties).toEqual({
      standing: 80,
      seated: null,
      included: [],
      replyWithin: "a day",
    });
  });

  it("each part may be missing on its own", () => {
    expect(
      readVenueDetails({ openingHours: WEEK, parties: null }),
    ).toMatchObject({ parties: null });
    expect(
      readVenueDetails({ openingHours: null, parties: { seated: 40 } }),
    ).toMatchObject({ openingHours: null, parties: { seated: 40 } });
  });

  it("asks for the gallery's photos with their assets' address and size", () => {
    expect(VENUE_DETAILS_QUERY).toMatch(/"gallery": gallery\[\]/);
    expect(VENUE_DETAILS_QUERY).toMatch(/asset->metadata\.dimensions\.width/);
  });

  it("passes the gallery on in its order, without what isn't a photo", () => {
    const one = { url: "https://cdn.sanity.io/a.webp", width: 1, height: 1 };
    const two = { url: "https://cdn.sanity.io/b.webp", width: 2, height: 1 };
    expect(
      readVenueDetails({ openingHours: WEEK, gallery: [two, null, one] })
        .gallery,
    ).toEqual([two, one]);
    expect(readVenueDetails({ openingHours: WEEK }).gallery).toEqual([]);
  });

  it("no document: nothing", () => {
    expect(readVenueDetails(null)).toEqual({
      openingHours: null,
      parties: null,
      gallery: [],
    });
  });
});
