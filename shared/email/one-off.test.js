import { describe, expect, it } from "vitest";
import { MAILCHIMP_TAGS, campaignFoot } from "./campaign.js";
import { renderOneOffEmail } from "./one-off.js";
import { SECTION_KINDS, cleanSections, copyInlineHtml, copyInlineText, paragraphs, safeLink } from "./sections.js";
import { emailSite } from "./site.js";
import { renderWeeklyEmail } from "../weekly-email/render.js";
import { weeklyEmailModel } from "../weekly-email/model.js";
import { testCatalog } from "../weekly-email/testing.js";

const site = emailSite("https://gwenda-web-dev.pages.dev/");
const images = { projectId: "proj123", dataset: "production" };
const ASSET = "image-abc123-1600x1200-jpg";

const render = (sections, extra = {}) =>
  renderOneOffEmail({ subject: "New Year's Eve", previewText: "Doors at 9", sections, ...extra }, { site, images });

describe("a one-off email", () => {
  it("has the subject, the preview line, the logo on top and the campaign foot", () => {
    const email = render([]);
    expect(email.subject).toBe("New Year's Eve");
    expect(email.preheader).toBe("Doors at 9");
    expect(email.html).toContain("<title>New Year's Eve</title>");
    expect(email.html).toContain("https://gwenda-web-dev.pages.dev/brand/logo-email-social.png");
    expect(email.html).toContain(">Hackney Wick<");
    for (const tag of Object.values(MAILCHIMP_TAGS)) expect(email.html).toContain(tag);
    expect(email.html).toContain("Doors at 9");
    // The text version ends with the same foot.
    expect(email.text).toContain(`Unsubscribe: ${MAILCHIMP_TAGS.unsubscribe}`);
  });

  it("draws an image across the column, from its Sanity asset, with its alt text", () => {
    const { html, text } = render([{ kind: "image", assetId: ASSET, alt: "The bar at night" }]);
    const src = /<img src="([^"]+)" width="560"/.exec(html)?.[1].replace(/&amp;/g, "&");
    expect(src).toBeTruthy();
    const url = new URL(src);
    expect(url.pathname).toBe("/images/proj123/production/abc123-1600x1200.jpg");
    expect(url.searchParams.get("w")).toBe("1120");
    expect(url.searchParams.get("fm")).toBe("jpg");
    expect(url.searchParams.has("fit")).toBe(false); // whole, at its own shape
    expect(html).toContain('alt="The bar at night"');
    expect(text).toContain("[The bar at night]");
  });

  it("draws a heading in the poster face, and in capitals in the text", () => {
    const { html, text } = render([{ kind: "heading", text: "Party <time>" }]);
    expect(html).toMatch(/<h2 class="display"[^>]*>Party &lt;time&gt;<\/h2>/);
    expect(text).toContain("PARTY <TIME>");
  });

  it("draws copy as paragraphs, with bold and links, and lines kept", () => {
    const { html, text } = render([
      { kind: "copy", text: "First **big** news.\nSecond line.\n\nSee [the menu](https://gwenda.co.uk/menu) or [write](mailto:hi@gwenda.co.uk)." },
    ]);
    expect(html).toContain('First <strong style="font-weight:700;color:#f2e8d2;">big</strong> news.<br>Second line.</p>');
    expect(html).toContain('<a href="https://gwenda.co.uk/menu" style="color:#dba63c;text-decoration:underline;">the menu</a>');
    expect(html).toContain('<a href="mailto:hi@gwenda.co.uk"');
    expect(html.match(/<p class="slab"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(text).toContain("First big news.\nSecond line.");
    expect(text).toContain("See the menu (https://gwenda.co.uk/menu) or write (hi@gwenda.co.uk).");
  });

  it("draws a button to its link, and leaves out one without a working link", () => {
    const { html, text } = render([
      { kind: "button", label: "Get tickets", link: "https://gwenda.co.uk/nye" },
      { kind: "button", label: "Nope", link: "javascript:alert(1)" },
    ]);
    expect(html).toContain('href="https://gwenda.co.uk/nye"');
    expect(html).toContain(">Get tickets</a>");
    expect(html).not.toContain("Nope");
    expect(text).toContain("Get tickets: https://gwenda.co.uk/nye");
  });

  it("keeps sections in their order, and skips ones with nothing in them yet", () => {
    const { html } = render([
      { kind: "heading", text: "One" },
      { kind: "copy", text: "   " },
      { kind: "image", assetId: "" },
      { kind: "copy", text: "Two" },
    ]);
    expect(html.indexOf(">One<")).toBeLessThan(html.indexOf(">Two</p>"));
    expect(html).not.toContain("<img src=\"https://cdn.sanity.io");
  });

  it("escapes everything: no HTML from the editor reaches the email", () => {
    const { html } = render(
      [
        { kind: "copy", text: '<script>alert(1)</script> <img src=x onerror=alert(1)> **<b>x</b>** [<i>y</i>](https://a.example/"onmouseover=1)' },
        { kind: "heading", text: "<b>Hi</b>" },
        { kind: "button", label: "<b>Go</b>", link: "https://a.example" },
        { kind: "image", assetId: ASSET, alt: '"><script>' },
      ],
      { subject: "<i>Hey</i>" },
    );
    expect(html).not.toMatch(/<script|<img src=x|<b>|<i>|onmouseover="/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<title>&lt;i&gt;Hey&lt;/i&gt;</title>");
  });

  it("drops links that aren't http(s) or mailto, keeping their words", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.example", "ftp://x.example", "mailto:nobody"]) {
      expect(safeLink(bad)).toBe("");
      expect(copyInlineHtml(`[click](${bad})`)).toBe("click");
      expect(copyInlineText(`[click](${bad})`)).toBe("click");
    }
    expect(safeLink(" https://gwenda.co.uk/a?b=1 ")).toBe("https://gwenda.co.uk/a?b=1");
    expect(safeLink("MAILTO:hi@gwenda.co.uk")).toBe("MAILTO:hi@gwenda.co.uk");
  });
});

describe("sections", () => {
  it("are cleaned: unknown kinds and stray fields dropped, text trimmed to size", () => {
    expect(
      cleanSections([
        { kind: "heading", text: "  Hi\nthere  ", html: "<b>" },
        { kind: "raw", html: "<script>" },
        null,
        { kind: "button", label: "x".repeat(99), link: "https://a.example" },
        { kind: "image", assetId: ASSET, alt: "A", extra: 1 },
      ]),
    ).toEqual([
      { kind: "heading", text: "Hi there" },
      { kind: "button", label: "x".repeat(40), link: "https://a.example" },
      { kind: "image", assetId: ASSET, alt: "A" },
    ]);
    expect(cleanSections("nope")).toEqual([]);
    expect(cleanSections(Array.from({ length: 99 }, () => ({ kind: "copy", text: "x" }))).length).toBe(40);
  });

  it("each kind starts blank and cleans to itself", () => {
    for (const [id, kind] of Object.entries(SECTION_KINDS)) {
      const blank = kind.blank();
      expect(blank.kind).toBe(id);
      expect(kind.clean(blank)).toEqual(blank);
      expect(kind.empty(blank)).toBe(true);
    }
  });

  it("splits copy into paragraphs at blank lines", () => {
    expect(paragraphs("a\nb\n\n\n c \n \nd")).toEqual(["a\nb", "c", "d"]);
  });

  it("is a registry a renderer can extend with its own kind (the weekly email's What's on, later)", () => {
    const kinds = {
      ...SECTION_KINDS,
      whatsOn: {
        label: "What's on",
        blank: () => ({ kind: "whatsOn" }),
        clean: () => ({ kind: "whatsOn" }),
        empty: () => false,
        html: () => ["<tr><td>NIGHTS</td></tr>"],
        text: () => ["NIGHTS", ""],
      },
    };
    const email = renderOneOffEmail(
      { subject: "x", sections: [{ kind: "heading", text: "Hi" }, { kind: "whatsOn" }] },
      { site, images, kinds },
    );
    expect(email.html.indexOf(">Hi<")).toBeLessThan(email.html.indexOf("NIGHTS"));
    expect(email.text).toContain("NIGHTS");
  });
});

describe("the campaign frame, shared by both emails", () => {
  it("gives the weekly email the same foot as a one-off", () => {
    const weekly = renderWeeklyEmail(weeklyEmailModel(testCatalog(), { today: "2026-11-10", origin: site.origin }));
    const foot = campaignFoot(site).join("\n");
    expect(weekly.html).toContain(foot);
    expect(render([]).html).toContain(foot);
  });
});
