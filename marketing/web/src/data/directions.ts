/**
 * How to get to Gwenda (#240), shared by home's way-here row and Finding us
 * so the two never disagree. Written to match the map's own notes.
 */
export const directions = {
  intro:
    "We’re right on the canal at Schwartz Wharf, just round the corner from Barge East. Hop off the Overground at Hackney Wick, wander down the lane, hit the towpath and you’re basically here.",
  fromStation: {
    heading: "From the station",
    steps: [
      "Out of the station, railway at your back, head south. 300-odd paces.",
      "Hang a left on White Post Lane, past the theatre, down to the water.",
      "Hit the towpath and go right, down along the river.",
      "Where the canal comes in, a few steps along. That’s us. X marks the bar.",
    ],
    note: "Locals cut straight down the yard. You’ll get the hang of it.",
  },
  fromTowpath: {
    heading: "Already on the towpath?",
    text: "Walking, running, on a bike, whatever. Find Barge East, swing round the corner onto the canal, and there we are on the bank. Come on in.",
  },
} as const;
