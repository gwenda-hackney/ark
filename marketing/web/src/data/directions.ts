/**
 * How to get to Gwenda (#240), shared by home's way-here row and Finding us
 * so the two never disagree. Written to match the map's own notes.
 */
export const directions = {
  intro:
    "Schwartz Wharf, on the canal, round the corner from Barge East. Overground to Hackney Wick, along White Post Lane, down the yard to the water. Five minutes, ten if you stop to look at the walls.",
  fromStation: {
    heading: "From the station",
    steps: [
      "Out of Hackney Wick station, railway behind you, head south.",
      "Left onto White Post Lane, past the theatre.",
      "Straight down the yard to the canal.",
      "That’s us, right on the water.",
    ],
    note: "Lost? Ask for Barge East. We’re round the corner.",
  },
  fromTowpath: {
    heading: "Already on the towpath?",
    text: "On foot, on a bike, off a boat. Find Barge East, go round the corner, and we’re there on the bank.",
  },
} as const;
