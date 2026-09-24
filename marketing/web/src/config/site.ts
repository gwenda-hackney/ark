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
      description:
        "Join the list or apply to play at Gwenda in Hackney Wick.",
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
      "Across the water from The Pirate's Hub. A terrace under the olive trees at Schwartz Wharf.",
    storyBodyPromo: [
      "Italian small plates, and craft cocktails made in the house. If a DJ is playing, it is usually someone from the Wick. If there is art on the wall, it is usually by someone who lives here. Bring a weeknight if you have one.",
      "The name comes from Guenda, an outdoor nightclub in Salento where everybody met in the summer.",
    ],
    storyClosingPromo:
      "Friends still talk about those nights. We would like this place to be remembered the same way.",
    storyBody: [
      "Italian small plates, and craft cocktails made in the house. If a DJ is playing, it is usually someone from the Wick. If there is art on the wall, it is usually by someone who lives here. Bring a weeknight if you have one.",
      "The name comes from Guenda, an outdoor nightclub in Salento where everybody met in the summer.",
    ],
    storyClosing:
      "Friends still talk about those nights. We would like this place to be remembered the same way.",
    teamHeading: "Who we are",
    teamSections: [
      {
        heading: "Where we started",
        aside: false,
        paragraphs: [
          "We already run The Pirate's Hub on this stretch of canal. Gigi opened it on Fish Island: a room three metres by three. Porchetta roasted in the house. The crowd took their sandwiches to the canal.",
          "Gigi was born in Castro, on the Salento coast, and raised by the sea. He wanted that same gathering, and a kitchen big enough to cook for it.",
        ],
      },
      {
        heading: "What comes next",
        aside: false,
        paragraphs: [
          "Gwenda is the next room on this canal, among the artists and musicians of the Wick. The studios, the late nights. We know this pocket of the Wick.",
        ],
      },
      {
        heading: "The Wick",
        /** Held out of the page until it has a home. */
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
    whatWeDoEventsHeading: "Diary",
    whatWeDoEventsBody: "Residencies, live sets, and nights on the canal.",
    whatWeDoArtistHeading: "Featured artist",
    whatWeDoArtistBody:
      "Local artists take the wall. The work stays in the room.",
    whatWeDoArtistLink: "The wall",
    menuTeaseComingSoon: "Coming soon",
    bookTableEyebrow: "The table",
    bookTableHeading: "Book a table",
    bookTableLead:
      "Olive trees at Schwartz Wharf. A table, when you want one.",
    signupHeading: "Stay close",
    signupNavCta: "Join the experience",
    signupEyebrowPromo: "The list",
    signupSubheading:
      "Nights ahead. Openings, gatherings, and the occasional whisper.",
    signupSubheadingPromo:
      "Nights ahead. Openings, gatherings, and the occasional whisper.",
    signupConsent:
      "I agree to receive emails about events and nights at Gwenda. I can unsubscribe at any time.",
    signupButton: "Let me know",
    signupSuccessTitle: "You're on the list",
    signupSuccessLead:
      "We'll be in touch with nights ahead, and the occasional whisper.",
    signupSuccessBack: "Back to Gwenda",
    contactPage: {
      eyebrow: "Write to us",
      heading: "Get in touch",
      lead: "Stay on the list for nights ahead, or write if you’d like to play here.",
      listEyebrow: "The list",
      listHeading: "Stay close",
      listLead:
        "Nights ahead. Openings, gatherings, and the occasional whisper.",
      listCta: "Stay in touch",
      playEyebrow: "The floor",
      playHeading: "Play at Gwenda",
      playLead:
        "A canalside room for DJs, live acts, and selectors who want something a little more intimate. Bring your sound. Tell us what you’d play here.",
      playCta: "Play at Gwenda",
    },
  },
} as const;
