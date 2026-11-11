import { siteConfig } from "../config/site";

const { geo } = siteConfig.location;

/**
 * How to get to Gwenda (#240), shared by home's way-here row and Finding us
 * so the two never disagree. Written to match the map's own notes, and the
 * real walk (traced from OpenStreetMap): about 200 m, 270 paces, down the
 * yard; about 360 m by the water.
 */
export const directions = {
  /** The walk in a line, for home's Find us. */
  short: "Five minutes’ walk from Hackney Wick station, right on the canal.",
  /** Where we are, before the how. */
  intro:
    "On the canal where the Hertford Union meets the Lee, round the corner from Barge East. Five minutes from Hackney Wick station, ten if you stop to look at the walls.",
  fromStation: {
    heading: "From the station",
    steps: [
      "Out of Hackney Wick station on the south side, onto White Post Lane.",
      "Follow it round to the left, past the Yard Theatre, to the big round Gwenda sign. About 170 paces.",
      "Turn right at the sign and down the yard (Schwartz Wharf) to our door. About 100 paces.",
    ],
    /** The other way in, along the canal */
    byWater:
      "Or by the water: carry on to the bridge, and just before it go down to the towpath, along the water and round the corner.",
    note: "Lost? Ask for Barge East. We’re round the corner.",
  },
  fromTowpath: {
    heading: "Already on the towpath?",
    text: "On foot, on a bike, off a boat. Find Barge East, go round the corner, and we’re there on the bank.",
  },
  /** Google's directions: opens the Maps app on a phone, routed to the bar */
  mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${geo.latitude},${geo.longitude}`,
} as const;
