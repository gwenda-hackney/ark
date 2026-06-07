export const siteConfig = {
  name: "Gwenda",
  tagline: "Hackney Wick",
  domain: "https://gwenda.co.uk",
  openingDate: "2026-07-15",
  openingRoman: "MMXXVI",
  heroSeasonWord: "Summer",
  description:
    "A polished Italian ristorbar on the Hackney Wick canal — real food, serious cocktails, wine and craft beer, with local art, music, and producers at the centre.",
  features: {
    showMenu: false,
    /** Off during promo — cocktail images are placeholders (AI-generated) */
    showGallery: false,
    showPrices: false,
    revealDrinkNames: false,
  },
  social: {
    instagram: "https://instagram.com/gwenda.hackneywick",
    tiktok: "https://tiktok.com/@gwenda.hackneywick",
  },
  location: {
    area: "Hackney Wick",
    address: "4 Schwartz Wharf, London, E9 5AA",
    addressShort: "Schwartz Wharf, Hackney Wick",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=4+Schwartz+Wharf,+London,+E9+5AA",
  },
  copy: {
    descriptionPromo:
      "A polished ristorbar on the Hackney Wick canal. Opening soon.",
    heroEyebrow: "Opening Summer 2026",
    heroCta: "Join the experience",
    storyHeading: "Behind the door",
    storyLead:
      "A polished ristorbar on the canal — grounded in Hackney Wick's art culture.",
    storyBodyPromo: [
      "Real Italian food, serious cocktails, natural wine, and craft beer. Local producers where we can — local art and music on the walls.",
      "The menu stays close to the chest. The door opens soon.",
    ],
    storyClosingPromo: null,
    storyBody: [
      "Real Italian food, not theatre. Cocktails, wine, and craft beer worth taking seriously. Local producers wherever we can — because this neighbourhood deserves a menu that actually comes from here.",
      "The kitchen sits at the centre of everything. It works in lockstep with the bar — a gastro experience built for Hackney Wick, not borrowed from somewhere else.",
      "Food and drink are only half the room. Local musicians, local art on the walls, the creative pulse of the Wick running right through it. Entertainment here means people you might already know, playing and showing work that matters.",
      "The full menu stays close to the chest for now. The door opens 15 July — join the experience and we'll keep you in the loop.",
    ],
    teamHeading: "Who we are",
    teamLead:
      "An independent team with a proven track record in Hackney Wick and Fish Island — Gwenda isn't our first venture in this neighbourhood.",
    teamBody: [
      "We're the people behind The Pirate's Hub. We know the canal, the studios, and the rhythm of the Wick — what's worked here and what this place is still hungry for.",
      "Deep roots with local artists, DJs, creatives, professionals, and residents. That network isn't decoration — it's how Gwenda gets built right, with the people who already make this corner of London worth showing up for.",
    ],
    galleryHeading: "A glimpse within",
    gallerySubheading: "The details reveal themselves in time",
    signupHeading: "The list",
    signupSubheading:
      "Be among the first through the door. Opening updates, private invitations, and the occasional whisper.",
    signupSubheadingPromo:
      "Still fitting out. Leave your email — we'll send updates as opening gets closer.",
    footerOpeningPromo: "Opening Summer 2026",
    signupConsent:
      "I agree to receive opening updates and marketing emails from Gwenda. I can unsubscribe at any time.",
    signupButton: "Let me know",
    signupSuccess: "Got it. We'll be in touch.",
  },
} as const;

export const buttondownUsername =
  import.meta.env.PUBLIC_BUTTONDOWN_USERNAME ?? "";

export const cfBeaconToken =
  import.meta.env.PUBLIC_CF_BEACON_TOKEN ?? "";
