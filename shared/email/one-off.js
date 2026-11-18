/**
 * A one-off email to the list (#348), written in ops: a subject, a preview
 * line, and sections (sections.js) between the fixed top and foot every
 * campaign has (campaign.js). Pure: the same function draws ops' live
 * preview in the browser and the email Mailchimp sends.
 */
import { MAILCHIMP_TAGS, campaignFootText, campaignHtml } from "./campaign.js";
import { SECTION_KINDS, cleanSections, renderSections } from "./sections.js";

/**
 * @param {{ subject?: string, previewText?: string, sections?: object[] }} email
 * @param {object} frame where it's sent from
 * @param {import("./campaign.js").CampaignSite} frame.site
 * @param {{ projectId: string, dataset: string }} [frame.images] the Sanity project its pictures are in
 * @param {string} [frame.logoUrl]
 * @param {typeof MAILCHIMP_TAGS} [frame.tags]
 * @param {Record<string, import("./sections.js").SectionKind>} [frame.kinds]
 * @returns {{ subject: string, preheader: string, html: string, text: string }}
 */
export function renderOneOffEmail(email, { site, images, logoUrl, tags = MAILCHIMP_TAGS, kinds = SECTION_KINDS }) {
  const subject = String(email?.subject ?? "").replace(/\s+/g, " ").trim();
  const preheader = String(email?.previewText ?? "").replace(/\s+/g, " ").trim();
  const sections = cleanSections(email?.sections, kinds);
  const { rows, lines } = renderSections(sections, { site, images }, kinds);
  const html = campaignHtml({ site, subject, preheader, rows, logoUrl, tags });
  const text = [...(subject ? [subject.toUpperCase(), ""] : []), ...lines, ...campaignFootText(site, tags)].join("\n");
  return { subject, preheader, html, text };
}
