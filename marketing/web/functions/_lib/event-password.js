/** Evocative, URL-safe words for invite event passwords (three per link). */
export const EVENT_PASSWORD_WORDS = [
  "archive",
  "brass",
  "canal",
  "candle",
  "velvet",
  "vinyl",
  "wharf",
  "ember",
  "harbor",
  "lantern",
  "marble",
  "meadow",
  "mirror",
  "orchard",
  "parlor",
  "patina",
  "porch",
  "ribbon",
  "river",
  "salon",
  "shadow",
  "signal",
  "silver",
  "smoke",
  "spark",
  "stone",
  "storm",
  "studio",
  "summit",
  "tallow",
  "timber",
  "twilight",
  "velour",
  "veranda",
  "vessel",
  "violet",
  "walnut",
  "window",
  "winter",
  "amber",
  "anchor",
  "antique",
  "arcade",
  "atlas",
  "autumn",
  "balcony",
  "barley",
  "beacon",
  "bloom",
  "breeze",
  "brook",
  "cabinet",
  "canvas",
  "cascade",
  "cellar",
  "chapel",
  "cipher",
  "clover",
  "copper",
  "coral",
  "cotton",
  "courtyard",
  "crimson",
  "dawn",
  "deck",
  "delta",
  "dusk",
  "echo",
  "eden",
  "elm",
  "fable",
  "fern",
  "flame",
  "flint",
  "frost",
  "garden",
  "gilded",
  "glow",
  "granite",
  "grove",
  "harvest",
  "haven",
  "hazel",
  "hearth",
  "hedge",
  "hollow",
  "horizon",
  "indigo",
  "ink",
  "ivory",
  "jasmine",
  "jetty",
  "keepsake",
  "lagoon",
  "laurel",
  "ledger",
  "lilac",
  "linen",
  "lodge",
  "lotus",
  "lumen",
  "maple",
  "meander",
  "mercury",
  "midnight",
  "moss",
  "murmur",
  "nectar",
  "nimbus",
  "oak",
  "obsidian",
  "olive",
  "onyx",
  "opal",
  "orchid",
  "palace",
  "paper",
  "pearl",
  "pebble",
  "penumbra",
  "petal",
  "piano",
  "pillar",
  "pine",
  "plaza",
  "poem",
  "pond",
  "portal",
  "quartz",
  "quill",
  "rain",
  "raven",
  "reef",
  "relic",
  "rose",
  "rust",
  "saffron",
  "sage",
  "satin",
  "secret",
  "serene",
  "shoal",
  "silk",
  "slate",
  "solace",
  "sonata",
  "spruce",
  "starlight",
  "still",
  "stream",
  "sunset",
  "tapestry",
  "terra",
  "thistle",
  "tide",
  "torch",
  "tower",
  "trail",
  "tulip",
  "umber",
  "valley",
  "vault",
  "verdant",
  "vista",
  "willow",
  "wisteria",
  "wool",
  "zephyr",
];

export const EVENT_PASSWORD_QUERY = "event-password";

/** Three lowercase words, hyphen-separated. */
export const EVENT_PASSWORD_PATTERN = /^[a-z]{2,20}(-[a-z]{2,20}){2}$/;

/** Legacy alphanumeric channel codes (pre word-password links). */
export const LEGACY_CHANNEL_TOKEN_PATTERN = /^[a-z0-9]{6,40}$/i;

function randomWordIndex() {
  const max = EVENT_PASSWORD_WORDS.length;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function generateEventPassword() {
  return [
    EVENT_PASSWORD_WORDS[randomWordIndex()],
    EVENT_PASSWORD_WORDS[randomWordIndex()],
    EVENT_PASSWORD_WORDS[randomWordIndex()],
  ].join("-");
}

export function normalizeEventPassword(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function isValidEventPassword(value) {
  const normalized = normalizeEventPassword(value);
  if (!normalized) return false;
  return (
    EVENT_PASSWORD_PATTERN.test(normalized) ||
    LEGACY_CHANNEL_TOKEN_PATTERN.test(normalized)
  );
}

export function readEventPasswordFromSearchParams(searchParams) {
  if (!searchParams) return null;
  const fromQuery =
    typeof searchParams.get === "function"
      ? (searchParams.get(EVENT_PASSWORD_QUERY) ?? searchParams.get("key"))
      : null;
  return fromQuery?.trim() ? fromQuery : null;
}

export function buildEventInviteUrl(origin, slug, password) {
  const base = origin.replace(/\/$/, "");
  const cleanSlug = slug.trim();
  const cleanPassword = normalizeEventPassword(password);
  const url = new URL(`${base}/events/${encodeURIComponent(cleanSlug)}`);
  url.searchParams.set(EVENT_PASSWORD_QUERY, cleanPassword);
  return url.toString();
}
