export const siteConfig = {
  name: "Gwenda",
  tagline: "Hackney Wick",
  domain: "https://gwenda.co.uk",
  openingRoman: "MMXXVI",
  menuAntiquated: "Tabula",
  /** Public venue type — titles, SEO, listings. See docs/brand-brief.md § Public naming */
  publicLabel: "Ristobar",
  description:
    "A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art, and vinyl on the decks.",
  features: {
    showMenu: false,
    /** Off during promo — cocktail images are placeholders (AI-generated) */
    showGallery: false,
    showPrices: false,
    revealDrinkNames: false,
  },
  /** SEO & link previews — WhatsApp, iMessage, Slack, X, Google snippets */
  seoTitle: "Gwenda | Hackney Wick, London",
  /**
   * Per-page titles and meta descriptions for organic search.
   * Unique copy helps Google build sitelinks (Events, Menu, etc.) under the main result.
   * Lead with the distinctive phrase; keep under ~155 characters.
   */
  seo: {
    home: {
      title: "Gwenda | Hackney Wick, London",
      description:
        "A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art, and vinyl on the decks.",
    },
    whatsOn: {
      title: "What's on · Gwenda",
      description:
        "Nights at Gwenda. Residencies, live music, and canalside gatherings in Hackney Wick.",
    },
    schedule: {
      title: "Schedule · Gwenda",
      description:
        "Every night at Gwenda, listed week by week. Residencies and one-off evenings in Hackney Wick.",
    },
    menu: {
      title: "Menu · Gwenda",
      description:
        "Craft cocktails, Italian small plates, and natural wine. The list at Gwenda, Hackney Wick.",
    },
    privacy: {
      title: "Privacy · Gwenda",
      description:
        "How Gwenda handles your email and data. Privacy policy for gwenda.co.uk.",
    },
    contact: {
      title: "Contact · Gwenda",
      description: "Join the list or apply to play at Gwenda in Hackney Wick.",
    },
    artists: {
      title: "Featured artist · Gwenda",
      description:
        "We collaborate with local artists and give them the wall at Gwenda, a canalside ristobar in Hackney Wick.",
    },
    acknowledgements: {
      title: "Acknowledgements · Gwenda",
      description:
        "People from the Wick we work with. Named here so you can go and find them.",
    },
    about: {
      title: "About · Gwenda",
      description:
        "Where Gwenda started. Gigi, The Pirate's Hub, and a name from a summer nightclub in Salento.",
    },
  },
  /** Topics for schema.org knowsAbout (helps Google associate the venue). */
  seoTopics: [
    "Hackney Wick ristobar",
    "craft cocktails London",
    "Italian small plates",
    "canalside bar Hackney Wick",
    "vinyl and art",
  ],
  social: {
    instagram: "https://www.instagram.com/gwendahackney",
    tiktok: "",
    shareTitle: "Gwenda | Hackney Wick, London",
    shareDescription:
      "A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art and vinyl.",
    imageAlt: "Gwenda on the Hackney Wick canal.",
  },
  location: {
    area: "Hackney Wick",
    streetAddress: "Unit 4003, 4 Schwartz Wharf",
    addressLocality: "London",
    addressRegion: "England",
    postalCode: "E9 5AA",
    address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
    addressShort: "Schwartz Wharf, Hackney Wick",
    mapsUrl: "https://maps.app.goo.gl/HDUpp4fGpFzJo3Me6",
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
      "A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art and vinyl.",
    heroCta: "Enter our world",
    bookingCta: "Book a table",
    storyHeading: "Behind the Doors",
    storyLead:
      "Canalside in Hackney Wick. Craft cocktails, Italian small plates, art, and vinyl on the decks.",
    storyBodyPromo: [
      "Italian small plates, refined for candlelight. Rotating signature cocktails, hand-crafted in-house, elevated for the lounge.",
    ],
    storyClosingPromo:
      "Who is Gwenda? We can't say. Come experience for yourself.",
    storyBody: [
      "Italian small plates, refined for candlelight. Rotating signature cocktails, hand-crafted in-house, elevated for the lounge.",
    ],
    storyClosing: "Who is Gwenda? We can't say. Come experience for yourself.",
    teamHeading: "Who we are",
    teamSections: [
      {
        heading: "Where we started",
        /** Lives on /about, which is not published yet. */
        aside: true,
        paragraphs: [
          "Gigi already runs The Pirate's Hub on this canal. A room three metres by three on Fish Island, porchetta from the house, sandwiches taken down to the water.",
          "Born in Castro, on the Salento coast. He wanted that gathering again, and a kitchen big enough to cook for it.",
        ],
      },
      {
        heading: "What comes next",
        aside: true,
        paragraphs: [
          "Gwenda is the next room on this canal, among the artists and musicians of the Wick.",
        ],
      },
      {
        heading: "The name",
        aside: true,
        paragraphs: [
          "The name comes from Guenda, a summer nightclub in Salento where everybody met.",
          "Friends still talk about those nights. We would like this place to be remembered the same way.",
        ],
      },
      {
        heading: "The Wick",
        /** On /about, which is not published yet. */
        aside: true,
        paragraphs: [
          "The nights are played by people from here. The wall is for artists who live here. The room is for the Wick: artists, selectors, musicians, and performers.",
        ],
        showLinks: true,
      },
    ],
    galleryHeading: "A glimpse within",
    gallerySubheading: "The details reveal themselves in time",
    menuTeaseHeading: "What we serve",
    menuTeaseLead: "Signature cocktails, made in the house. Food follows.",
    whatWeDoEyebrow: "The room",
    whatWeDoHeading: "What's on",
    whatWeDoLead:
      "Not a restaurant with a drinks list. Not a bar with a kitchen annex. An archive salon where food, drink, art, and sound converge.",
    whatWeDoBody:
      "Artists take the wall, selectors take the decks, and musicians take the room.",
    whatWeDoEventsHeading: "Events",
    whatWeDoEventsBody: "Residencies, live sets, and nights on the canal.",
    whatWeDoArtistHeading: "Featured artist",
    whatWeDoArtistBody:
      "Local artists take the wall. The work stays in the room.",
    menuTeaseComingSoon: "Coming soon",
    bookTableEyebrow: "The table",
    bookTableHeading: "Book a table",
    bookTableLead: "Olive trees at Schwartz Wharf. A table, when you want one.",
    signupHeading: "Join the list",
    signupNavCta: "Join the experience",
    signupEyebrowPromo: "The list",
    signupSubheading:
      "What’s on, new nights, and the odd party. No spam, unsubscribe any time.",
    signupSubheadingPromo:
      "What’s on, new nights, and the odd party. No spam, unsubscribe any time.",
    signupConsent:
      "I agree to receive emails about events and nights at Gwenda. I can unsubscribe at any time.",
    signupButton: "Let me know",
    signupSuccessTitle: "You're on the list",
    signupSuccessLead:
      "We'll be in touch with nights ahead, and the occasional whisper.",
    signupSuccessBack: "Back to Gwenda",
    contactPage: {
      eyebrow: "Write to us",
      heading: "Say hello",
      lead: "Get on the list, or tell us you want to play.",
      listEyebrow: "The list",
      listHeading: "Join the list",
      listLead:
        "New nights, what’s on, the odd party. Nothing boring, and you can bail whenever.",
      listCta: "Sign me up",
      playEyebrow: "The floor",
      playHeading: "Play at Gwenda",
      playLead:
        "Got records? Got a band? Got a mate who won’t shut up about their mixes? We want this place to sound like Hackney Wick, so come and play. Tell us what you’d bring.",
      playCta: "Apply to play",
    },
  },
} as const;
