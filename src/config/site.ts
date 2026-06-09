export const siteConfig = {
  name: "Gwenda",
  tagline: "Hackney Wick",
  domain: "https://gwenda.co.uk",
  openingDate: "2026-07-15",
  openingRoman: "MMXXVI",
  heroSeasonWord: "Summer",
  description:
    "Gwenda is an archive salon on Schwartz Wharf. Craft cocktails, rare Italian street food, local art, and music on the Hackney Wick canal.",
  features: {
    showMenu: false,
    /** Off during promo — cocktail images are placeholders (AI-generated) */
    showGallery: false,
    showPrices: false,
    revealDrinkNames: false,
  },
  social: {
    instagram: "",
    tiktok: "",
    /** Link previews — WhatsApp, iMessage, Slack, X, etc. */
    shareTitle: "Gwenda | Hackney Wick",
    shareDescription:
      "Archive salon on Schwartz Wharf. Craft cocktails, rare Italian street food, local art, and music. Opening Summer 2026.",
    imageAlt: "Gwenda, archive salon on the Hackney Wick canal",
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
      "An archive salon on Schwartz Wharf, Hackney Wick. Opening Summer 2026.",
    heroEyebrow: "Opening Summer 2026",
    heroCta: "Enter our world",
    joinExperienceCta: "Join the experience",
    storyHeading: "Behind the Doors",
    storyLead:
      "On Schwartz Wharf: craft cocktails, rare regional Italian street food, art from local studios, and curated vinyl.",
    storyBodyPromo: [
      "We are not a restaurant that also pours drinks, or a bar that happens to serve food. The room is the point.",
      "The kitchen works from regional Italian street recipes you rarely see in London, refined for a lounge. The bar is built to the same level.",
      "Art on the walls rotates. The music is chosen for here. The canal is outside the door.",
    ],
    storyClosingPromo: "Who is Gwenda? We can't say. The door opens 15 July.",
    storyBody: [
      "We are not a restaurant that also pours drinks, or a bar that happens to serve food. The room is the point.",
      "The kitchen works from regional Italian street recipes you rarely see in London, refined for a lounge. The bar is built to the same level.",
      "Art on the walls rotates. The music is chosen for here. The canal is outside the door.",
    ],
    storyClosing: "Who is Gwenda? We can't say. The door opens 15 July.",
    teamHeading: "Who we are",
    teamLead:
      "We already run The Pirate's Hub on this stretch of canal. Gwenda is what comes next.",
    teamBody: [
      "Schwartz Wharf, the studios, the late nights. We know this pocket of the Wick.",
      "Gwenda is built with the artists and musicians who were here before the sign went up.",
    ],
    galleryHeading: "A glimpse within",
    gallerySubheading: "The details reveal themselves in time",
    menuTeaseEyebrow: "The menu",
    menuTeaseHeading: "What we serve",
    menuTeaseLead: "The full list opens with the door. Until then, a glimpse.",
    signupHeading: "Be the first to know",
    signupNavCta: "First to know",
    signupEyebrowPromo: "Almost there",
    signupSubheading:
      "Be among the first through the door. Opening updates, private invitations, and the occasional whisper.",
    signupSubheadingPromo:
      "We're putting the finishing touches on Gwenda. Leave your email and we'll be in touch.",
    footerOpeningPromo: "Opening Summer 2026",
    signupConsent:
      "I agree to receive opening updates and marketing emails from Gwenda. I can unsubscribe at any time.",
    signupButton: "Let me know",
    signupSuccessTitle: "You're on the list",
    signupSuccessLead:
      "We'll be in touch with opening updates, private invitations, and the occasional whisper.",
    signupSuccessBack: "Back to Gwenda",
  },
} as const;

export const cfBeaconToken =
  import.meta.env.PUBLIC_CF_BEACON_TOKEN ?? "";
