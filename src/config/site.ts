export const siteConfig = {
  name: "Gwenda",
  tagline: "Hackney Wick",
  domain: "https://gwenda.co.uk",
  openingRoman: "MMXXVI",
  menuAntiquated: "Tabula",
  /** Public venue type — titles, SEO, listings. See docs/brand-brief.md § Public naming */
  publicLabel: "Ristobar",
  description:
    "A canalside ristobar in Hackney Wick. Craft cocktails, hyper-regional Italian street food, art, and vinyl on the decks.",
  features: {
    showMenu: false,
    /** Off during promo — cocktail images are placeholders (AI-generated) */
    showGallery: false,
    showPrices: false,
    revealDrinkNames: false,
  },
  /** SEO & link previews — WhatsApp, iMessage, Slack, X, Google snippets */
  seoTitle: "Gwenda | Hackney Wick, London",
  social: {
    instagram: "https://www.instagram.com/gwendahackney",
    tiktok: "",
    shareTitle: "Gwenda | Hackney Wick, London",
    shareDescription:
      "A canalside ristobar in Hackney Wick. Craft cocktails, regional Italian food, art and vinyl.",
    imageAlt:
      "Gwenda on the Hackney Wick canal.",
  },
  location: {
    area: "Hackney Wick",
    streetAddress: "Unit 4003, 4 Schwartz Wharf",
    addressLocality: "London",
    addressRegion: "England",
    postalCode: "E9 5AA",
    address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
    addressShort: "Schwartz Wharf, Hackney Wick",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Unit%204003%2C%204%20Schwartz%20Wharf%2C%20London%2C%20E9%205AA",
    geo: {
      latitude: 51.541812,
      longitude: -0.022465,
    },
  },
  contact: {
    email: "hello@gwenda.co.uk",
  },
  /** Stable paths in public/ — synced from src/assets (see generate:brand-assets). */
  brand: {
    faviconPath: "/favicon.ico",
    faviconPngPath: "/favicon.png",
    faviconSize: 96,
    appleTouchIconPath: "/apple-touch-icon.png",
    /** Organization schema logo — min 112×112, dark brand background. */
    organizationLogoPath: "/brand/logo-organization.png",
    organizationLogoWidth: 511,
    organizationLogoHeight: 344,
  },
  copy: {
    descriptionPromo:
      "A canalside ristobar in Hackney Wick. Craft cocktails, hyper-regional Italian food, art and vinyl.",
    heroCta: "Enter our world",
    joinExperienceCta: "Join the experience",
    storyHeading: "Behind the Doors",
    storyLead:
      "Canalside in Hackney Wick. Craft cocktails, hyper-regional Italian street food, art, and vinyl on the decks.",
    storyBodyPromo: [
      "Not a restaurant with a drinks list. Not a bar with a kitchen annex. An archive salon where food, drink, art, and sound converge.",
      "Hyper-regional Italian street food, rarely seen in London, refined for candlelight. Rotating signature cocktails, hand-crafted in-house, elevated for the lounge.",
    ],
    storyClosingPromo:
      "Who is Gwenda? We can't say. Come experience for yourself.",
    storyBody: [
      "Not a restaurant with a drinks list. Not a bar with a kitchen annex. An archive salon where food, drink, art, and sound converge.",
      "Hyper-regional Italian street food, rarely seen in London, refined for candlelight. Rotating signature cocktails, hand-crafted in-house, elevated for the lounge.",
    ],
    storyClosing: "Who is Gwenda? We can't say. Come experience for yourself.",
    teamHeading: "Who we are",
    teamBody: [
      "We already run The Pirate's Hub on this stretch of canal. Gwenda is what comes next. The canal, the studios, the late nights—we know this pocket of the Wick.",
      "Gwenda grew up on the canal, among the artists and musicians of the Wick.",
    ],
    galleryHeading: "A glimpse within",
    gallerySubheading: "The details reveal themselves in time",
    menuTeaseHeading: "What we serve",
    menuTeaseLead: "The full list opens with the door. Until then, a glimpse.",
    signupHeading: "Be the first to know",
    signupNavCta: "First to know",
    signupEyebrowPromo: "Almost there",
    signupSubheading:
      "Be among the first through the door. Opening updates, private invitations, and the occasional whisper.",
    signupSubheadingPromo:
      "We're putting the finishing touches on Gwenda. Leave your email and we'll be in touch.",
    signupConsent:
      "I agree to receive opening updates and marketing emails from Gwenda. I can unsubscribe at any time.",
    signupButton: "Let me know",
    signupSuccessTitle: "You're on the list",
    signupSuccessLead:
      "We'll be in touch with opening updates, private invitations, and the occasional whisper.",
    signupSuccessBack: "Back to Gwenda",
  },
} as const;
