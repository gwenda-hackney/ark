/**
 * An email to the mailing list, sent as a Mailchimp campaign: the fixed top
 * (the logo, "Hackney Wick"), whatever goes between, and the fixed foot (the
 * links, why they got it, the way off the list, the address). The weekly
 * "what's on" email (shared/weekly-email/render.js) and the one-off emails
 * ops writes (shared/email/one-off.js) are both built in this frame, so the
 * two can't drift apart.
 *
 * The look is the shell's (shell.js); what's Mailchimp's is here: the merge
 * tags a campaign must carry to be sent at all.
 */
import { emailDocument, esc, FOOT_LINK, FOOT_SMALL, footLinks, href, logoHeader, row, rule } from "./shell.js";

/** Mailchimp's merge tags, filled in for each reader when a campaign goes out. */
export const MAILCHIMP_TAGS = {
  unsubscribe: "*|UNSUB|*",
  updateProfile: "*|UPDATE_PROFILE|*",
  archive: "*|ARCHIVE|*",
  addressLine: "*|LIST:ADDRESSLINE|*",
};

/**
 * Who sends it and where the fixed links go (shared/email/site.js emailSite).
 * @typedef {{ origin: string, name: string, social: string, instagram: string,
 *   whatsOn: string, mapsUrl: string, address: string }} CampaignSite
 */

/** The foot's rows: the links, why they got it, the way off, the address, the web copy. */
export function campaignFoot(site, tags = MAILCHIMP_TAGS) {
  return [
    rule(),
    row(
      footLinks([
        { text: "Instagram", href: site.instagram },
        { text: "What’s on", href: site.whatsOn },
        { text: "Find us", href: site.mapsUrl },
      ]) +
        `<p class="slab" style="margin:22px 0 0;${FOOT_SMALL}">You’re getting this because you got on the list at ${esc(site.name)}. Had enough? <a href="${href(tags.unsubscribe)}" style="${FOOT_LINK}">Unsubscribe</a>, or <a href="${href(tags.updateProfile)}" style="${FOOT_LINK}">change your details</a>.</p>` +
        `<p class="slab" style="margin:8px 0 0;${FOOT_SMALL}">${esc(site.name)} ${esc(site.social)} · ${esc(tags.addressLine)}</p>` +
        `<p class="slab" style="margin:8px 0 0;${FOOT_SMALL}"><a href="${href(tags.archive)}" style="${FOOT_LINK}">Read this in your browser</a></p>`,
      { bottom: 40, align: "center" },
    ),
  ];
}

/** The same foot as plain text lines, for the text version. */
export function campaignFootText(site, tags = MAILCHIMP_TAGS) {
  return [
    "--",
    `${site.name} ${site.social}, ${site.address}`,
    `Instagram: ${site.instagram}`,
    "",
    `You're getting this because you got on the list at ${site.name}.`,
    `Unsubscribe: ${tags.unsubscribe}`,
    `Change your details: ${tags.updateProfile}`,
    tags.addressLine,
    "",
  ];
}

/**
 * The whole campaign's HTML: the logo at the top, `rows` between, the foot.
 * @param {object} email
 * @param {CampaignSite} email.site
 * @param {string} email.subject
 * @param {string} [email.preheader]
 * @param {string[]} email.rows what goes between the top and the foot (row(), rule()…)
 * @param {string} [email.logoUrl] the logo's address; the site's own copy unless given
 * @param {typeof MAILCHIMP_TAGS} [email.tags]
 * @param {string} [email.css] more rules for the <style>
 */
export function campaignHtml({ site, subject, preheader = "", rows, logoUrl, tags = MAILCHIMP_TAGS, css = "" }) {
  return emailDocument({
    title: subject,
    preheader,
    rows: [
      ...logoHeader({ origin: site.origin, name: site.name, social: site.social, logo: logoUrl }),
      ...rows,
      ...campaignFoot(site, tags),
    ],
    css,
  });
}
