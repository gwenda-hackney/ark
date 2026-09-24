import { describe, expect, it } from "vitest";
import {
  artistPagePath,
  bioParagraphs,
  featuredFromArtists,
  opsArtistEnv,
  publicArtist,
  websiteLabel,
} from "./featured-artist.js";

describe("opsArtistEnv", () => {
  it("uses the ops token, not the marketing Baserow key", () => {
    expect(
      opsArtistEnv({
        BASEROW_API_KEY: "marketing",
        BASEROW_OPS_API_KEY: "ops",
        BASEROW_OPS_DATABASE_ID: "560292",
      }),
    ).toMatchObject({
      BASEROW_API_KEY: "ops",
      BASEROW_OPS_DATABASE_ID: "560292",
    });
    expect(opsArtistEnv({ BASEROW_API_KEY: "marketing" })).toBeNull();
  });
});

describe("featuredFromArtists", () => {
  it("publishes current and next, and drops storage names", () => {
    const featured = featuredFromArtists([
      {
        slot: "previous",
        name: "Ada",
        website: "",
        profile: "",
        bio: "",
        portrait: null,
        art: [],
        gwenda: [],
      },
      {
        slot: "current",
        name: "Rita Matos",
        artistName: "Rita",
        startMonth: "9",
        endMonth: "10",
        website: "https://www.ritamatosart.com/",
        profile: "London painter.",
        bio: "First line.\n\nSecond line.",
        portrait: { name: "secret.jpg", url: "https://files.example/face.jpg" },
        art: [
          {
            name: "a.jpg",
            label: "Holding on a little longer.jpg",
            url: "https://files.example/work.jpg",
          },
        ],
        gwenda: [{ name: "g.jpg", url: "" }],
      },
      {
        slot: "next",
        name: "Jo",
        website: "",
        profile: "Coming in.",
        bio: "",
        portrait: null,
        art: [],
        gwenda: [],
      },
    ]);
    expect(featured.current.name).toBe("Rita Matos");
    expect(featured.current.slug).toBe("rita-matos");
    expect(artistPagePath(featured.current)).toBe("/artists/current");
    expect(featured.current.artistName).toBe("Rita");
    expect(featured.current.runLabel).toBe("Sept to Oct");
    expect(featured.current.portrait).toBe("https://files.example/face.jpg");
    expect(featured.current.art).toEqual([
      {
        url: "https://files.example/work.jpg",
        label: "Holding on a little longer",
      },
    ]);
    expect(featured.current.gwenda).toEqual([]);
    expect(featured.current.name).not.toMatch(/secret/);
    expect(featured.next.name).toBe("Jo");
    expect(featured.next.artistName).toBe("Jo");
    expect(featured.previous.map((artist) => artist.slug)).toEqual(["ada"]);
    expect(artistPagePath(featured.previous[0])).toBe("/artists/ada");
    expect(
      artistPagePath(
        featuredFromArtists([
          { id: "9", slot: "previous", name: "Current", profile: "", bio: "" },
          { id: "4", slot: "previous", name: "Ada", profile: "", bio: "" },
          { id: "8", slot: "previous", name: "Ada", profile: "", bio: "" },
        ]).previous[0],
      ),
    ).toBe("/artists/current-9");
    expect(publicArtist({ name: "  " })).toBeNull();
    expect(
      publicArtist({ name: "Rita Matos", artistName: "  " })?.artistName,
    ).toBe("Rita");
  });
});

describe("bioParagraphs / websiteLabel", () => {
  it("splits lines and shows the host", () => {
    expect(bioParagraphs("One.\n\nTwo.")).toEqual(["One.", "Two."]);
    expect(websiteLabel("https://www.ritamatosart.com/")).toBe(
      "ritamatosart.com",
    );
  });
});
