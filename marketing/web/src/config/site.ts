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
        heading: "How it started",
        /** Lives on /about, which is not published yet. */
        aside: true,
        paragraphs: [
          "You might know Gigi from The Pirate's Hub, down the canal on Fish Island. Porchetta from the house, sandwiches taken down to the water.",
          "Gwenda is that again, with more room: a proper kitchen, and a place for the Wick to come together.",
        ],
      },
      {
        heading: "What it is",
        aside: true,
        paragraphs: [
          "A bar, a kitchen, records on the decks and a wall for local artists. Right on the canal, in the middle of the Wick.",
        ],
      },
      {
        heading: "Why Gwenda?",
        aside: true,
        paragraphs: [
          "It's named after Guenda, a summer club in Salento where everybody ended up.",
          "People still talk about those nights. We'd like this place to be like that.",
        ],
      },
      {
        heading: "The Wick",
        /** On /about, which is not published yet. */
        aside: true,
        paragraphs: [
          "The nights are played by people from round here, and the wall is for artists who live here. It's a room for the Wick: artists, DJs, musicians, whoever.",
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
    signupHeading: "Get on the list",
    signupNavCta: "Get on the list",
    signupEyebrowPromo: "Stay in the loop",
    signupSubheading:
      "What’s on, new nights, and the odd party. No spam, unsubscribe any time.",
    signupSubheadingPromo:
      "What’s on, new nights, and the odd party. No spam, unsubscribe any time.",
    signupConsent:
      "Yes, email me about nights at Gwenda. I can unsubscribe whenever.",
    signupButton: "Sign me up",
    signupSuccessTitle: "You're in",
    signupSuccessLead: "We'll let you know what's coming up. No spam, promise.",
    signupSuccessBack: "Back to Gwenda",
    contactPage: {
      eyebrow: "Get in touch",
      heading: "Say hello",
      lead: "Get on the list, or tell us you want to play.",
      listEyebrow: "Stay in the loop",
      listHeading: "Get on the list",
      listLead:
        "New nights, what’s on, the odd party. Nothing boring, and you can bail whenever.",
      listCta: "Sign me up",
      playEyebrow: "Bands, DJs, artists",
      playHeading: "Play at Gwenda",
      playLead:
        "Got records? Got a band? Got a mate who won’t shut up about their mixes? We want this place to sound like Hackney Wick, so come and play. Tell us what you’d bring.",
      /** More on the call, under the lead on home (#240) */
      playMore: [
        "This is meant to be the Wick’s room, not ours. DJs, bands, singers, poets, comedians, whoever. If you make something and need a room to do it in, we want to hear from you.",
        "Painters, photographers, illustrators: the wall’s yours. Local artists take it over, and the work stays up in the room.",
        "First gig or fiftieth, doesn’t matter. Send us a link, a few words, whatever you’ve got.",
      ],
      playCta: "Apply to play",
    },
  },
} as const;
