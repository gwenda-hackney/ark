import { describe, expect, it } from "vitest";
import {
  COLOURS,
  EMAIL_LOGO_PATH,
  button,
  emailDocument,
  emailLogoUrl,
  esc,
  href,
  logoHeader,
  row,
  transactionalFoot,
} from "./shell.js";
import { formatFormNotifyHtml } from "../forms/format.js";
import { weeklyEmailModel } from "../weekly-email/model.js";
import { renderWeeklyEmail } from "../weekly-email/render.js";
import { testCatalog } from "../weekly-email/testing.js";

const site = { origin: "https://gwenda.co.uk", name: "Gwenda", social: "Social" };

describe("the email shell", () => {
  it("puts the logo at the top: a flat PNG from the site, linked home", () => {
    const [logo, line] = logoHeader(site);
    expect(EMAIL_LOGO_PATH).toMatch(/\.png$/);
    expect(emailLogoUrl("https://gwenda.co.uk/")).toBe("https://gwenda.co.uk/brand/logo-email-social.png");
    expect(logo).toContain('<a href="https://gwenda.co.uk"');
    expect(logo).toContain('src="https://gwenda.co.uk/brand/logo-email-social.png"');
    expect(logo).toContain('alt="Gwenda Social"');
    expect(line).toContain("Social · Hackney Wick");
    expect(logoHeader({ ...site, logo: "cid:logo@gwenda" })[0]).toContain('src="cid:logo@gwenda"');
  });

  it("escapes text and refuses an href that isn't a web or mail address", () => {
    expect(esc(`<b a="1">&`)).toBe("&lt;b a=&quot;1&quot;&gt;&amp;");
    expect(href("javascript:alert(1)")).toBe("#");
    expect(href("https://gwenda.co.uk/?a=1&b=2")).toBe("https://gwenda.co.uk/?a=1&amp;b=2");
    expect(button("Change <it>", "data:text/html,x")).toContain('href="#"');
    expect(button("Change <it>", "https://gwenda.co.uk")).toContain("Change &lt;it&gt;");
  });

  it("wraps rows in one dark page, 600px wide, with the preview line when there is one", () => {
    const html = emailDocument({ title: "A <subject>", preheader: "Peek", rows: [row("Hello")] });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>A &lt;subject&gt;</title>");
    expect(html).toContain(`bgcolor="${COLOURS.board}"`);
    expect(html).toContain("max-width:600px");
    expect(html).toContain(">Peek&#847;");
    expect(emailDocument({ title: "x", rows: [] })).not.toContain("&#847;");
  });

  it("ends a transactional email with who we are and why, and no way off a list", () => {
    const foot = transactionalFoot({
      ...site,
      address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
      links: [{ text: "Find us", href: "https://maps.app.goo.gl/x" }],
      why: "You filled in a form.",
    }).join("");
    expect(foot).toContain("Gwenda Social · Unit 4003, 4 Schwartz Wharf, London, E9 5AA");
    expect(foot).toContain("You filled in a form.");
    expect(foot).not.toContain("*|");
    expect(foot).not.toMatch(/unsubscribe/i);
  });
});

describe("one shell for every email", () => {
  const weekly = renderWeeklyEmail(weeklyEmailModel(testCatalog(), { today: "2026-11-10" })).html;
  const form = formatFormNotifyHtml({
    form: { title: "Party enquiry", fields: [{ key: "name", label: "Name", type: "text" }] },
    answers: [{ key: "name", label: "Name", value: "Sam" }],
  });
  /** An email with its own rows taken out: what the shell wrote around them. */
  const frame = (html) => html.replace(/<title>[^<]*<\/title>/, "").replace(/<div style="display:none[\s\S]*?<\/div>\n/, "");
  const head = (html) => frame(html).slice(0, frame(html).indexOf("</head>")).replace(/@media[^\n]*\n/g, "");
  const top = (html) => html.slice(html.indexOf("max-width:600px"), html.indexOf("Hackney Wick</div>"));

  it("gives the weekly email and a form email the same head and the same logo header", () => {
    expect(head(form)).toBe(head(weekly));
    expect(top(form)).toBe(top(weekly));
    expect(top(form)).toBe(logoHeaderTop());
  });

  function logoHeaderTop() {
    const html = emailDocument({ title: "x", rows: logoHeader(site) });
    return top(html);
  }
});
