/** Venue and maps URLs shared by RSVP emails and tickets. Keep in sync with web/src/config/site.ts */

const { latitude, longitude } = {
  latitude: 51.541812,
  longitude: -0.022465,
};

/** Named pin for Gwenda at Schwartz Wharf (geo from site config). */
export const VENUE_MAPS_URL = `https://www.google.com/maps/search/Gwenda/@${latitude},${longitude},17z`;

export const DEFAULT_VENUE = "Schwartz Wharf, Hackney Wick, London E9 5AA";

/** Footer / contact details for transactional emails. */
export const SITE_DOMAIN = "https://gwenda.co.uk";
export const SITE_INSTAGRAM = "https://www.instagram.com/gwendahackney";
export const SITE_ADDRESS = "Unit 4003, 4 Schwartz Wharf, London, E9 5AA";
export const SITE_ADDRESS_SHORT = "Schwartz Wharf, Hackney Wick";
