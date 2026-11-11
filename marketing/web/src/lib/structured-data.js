import { richToPlain } from "../../functions/_lib/rich-text.js";
import { CHART_SECTIONS } from "./chart-nav.js";
import { FOOT_LINKS, PRIVACY_LINK } from "./chart-footer.js";

/**
 * The site's own navigation, as search engines read it (StructuredData.astro):
 * the five numbered places (chart-nav.js), then the foot's own (chart-footer.js),
 * each at its page's canonical address (with the slash, as the sitemap and
 * each page's canonical link give it), and a link to a part of a page
 * (/bookings#play) at that part of it.
 *
 * @param {string} domain
 */
export function siteNavigation(domain) {
  const links = [...CHART_SECTIONS, ...FOOT_LINKS, PRIVACY_LINK];
  const address = (href) => {
    const url = new URL(href, domain);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
    return url.href;
  };
  return {
    "@type": "ItemList",
    "@id": `${domain}/#navigation`,
    name: "Main navigation",
    itemListElement: links.map((link, index) => ({
      "@type": "SiteNavigationElement",
      position: index + 1,
      name: link.label,
      url: address(link.href),
    })),
  };
}

/**
 * The nights on What's on as schema.org events (once on the old schedule
 * page, #240), for search engines' listings of what's on.
 *
 * @param {Array<{ title: string, date: string, description?: string, artist?: string }>} nights
 * @param {{ name: string, domain: string, location: { streetAddress: string, addressLocality: string, postalCode: string } }} venue
 */
export function nightsStructuredData(nights, { name, domain, location }) {
  return nights.map((night) => ({
    "@type": "Event",
    name: night.title,
    startDate: night.date,
    description: richToPlain(night.description),
    ...(night.artist
      ? { performer: { "@type": "Person", name: night.artist } }
      : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name,
      address: {
        "@type": "PostalAddress",
        streetAddress: location.streetAddress,
        addressLocality: location.addressLocality,
        postalCode: location.postalCode,
      },
    },
    organizer: { "@type": "Organization", name, url: domain },
  }));
}
