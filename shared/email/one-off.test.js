import { describe, expect, it } from "vitest";
import { MAILCHIMP_TAGS, campaignFoot } from "./campaign.js";
import { renderOneOffEmail } from "./one-off.js";
import { BOOKING, SECTION_KINDS, cleanSections, copyInlineHtml, copyInlineText, paragraphs, safeLink } from "./sections.js";
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

  it("draws a logo small, whole and centred", () => {
    const { html } = render([{ kind: "image", assetId: ASSET, alt: "Pinsa A Roma logo", size: "logo" }]);
    const src = /<img src="([^"]+)" width="160"/.exec(html)?.[1].replace(/&amp;/g, "&");
    expect(src).toBeTruthy();
    expect(new URL(src).searchParams.get("w")).toBe("320");
    expect(new URL(src).searchParams.has("fit")).toBe(false);
    expect(html).not.toContain('width="560"');
    expect(html).toContain('alt="Pinsa A Roma logo"');
  });

  it("draws a collaboration as Gwenda's logo × theirs, on one line", () => {
    const { html, text } = render([{ kind: "image", assetId: ASSET, alt: "Pinsa A Roma", size: "collab" }]);
    expect(html).toMatch(/<img src="[^"]+\/brand\/logo-email-social\.png" width="130" alt="Gwenda"[^>]*><\/td><td[^>]*>&times;<\/td><td[^>]*><img src="[^"]+" width="130"/);
    expect(html).toContain('alt="Pinsa A Roma"');
    expect(text).toContain("GWENDA × PINSA A ROMA");
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

  it("draws a button as the website's: an underlined link unless it says outline, never a gold block", () => {
    const [plain, outline, odd] = cleanSections([
      { kind: "button", label: "See the menu", link: "https://a.example" },
      { kind: "button", label: "See the menu", link: "https://a.example", look: "outline" },
      { kind: "button", label: "See the menu", link: "https://a.example", look: "filled" },
    ]);
    expect([plain.look, outline.look, odd.look]).toEqual(["link", "outline", "link"]);
    expect(render([plain]).html).toMatch(/<a href="https:\/\/a\.example" class="slab" style="[^"]*text-decoration:underline;">See the menu<\/a>/);
    expect(render([outline]).html).toContain("border:2px solid #c9a24a;");
    expect(render([plain, outline]).html).not.toContain("background-color:#c9a24a");
  });

  it("draws Book a table as the website's button, its words and its link, every time", () => {
    const [booking] = cleanSections([{ kind: "booking", label: "Ignored", link: "https://elsewhere.example" }]);
    expect(booking).toEqual({ kind: "booking" });
    const { html, text } = render([booking]);
    expect(BOOKING).toEqual({ label: "Book a table", link: expect.stringContaining("opentable.co.uk") });
    expect(html).toContain(`href="${BOOKING.link.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("background-color:#c9a24a;");
    expect(html).toContain('src="https://gwenda-web-dev.pages.dev/brand/email-bell.png"');
    expect(html).toContain(`>${BOOKING.label}</a>`);
    expect(html).not.toContain("elsewhere.example");
    expect(text).toContain(`Book a table: ${BOOKING.link}`);
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

describe("drawn for ops' editor (marks)", () => {
  const sections = [
    { kind: "heading", text: "Party" },
    { kind: "copy", text: "Doors at 9.\n\nMusic **till late**." },
    { kind: "heading", text: "" },
    { kind: "copy", text: "" },
  ];
  const marked = renderOneOffEmail({ subject: "S", sections }, { site, images, marks: true }).html;

  it("never in an email that's sent", () => {
    const html = render(sections).html;
    expect(html).not.toContain("data-section");
    expect(html).not.toContain("data-edit");
  });

  it("marks each row with its section's place, and the words that can be typed over", () => {
    expect(marked).toMatch(/<tr data-section="0">[\s\S]*?<h2 class="display" data-edit="heading" data-placeholder="Type a heading"[^>]*>Party<\/h2>/);
    expect(marked).toMatch(/<tr data-section="1"><td align="left" data-edit="copy" data-placeholder="Type here"[^>]*><p [^>]*>Doors at 9\.<\/p><p [^>]*>Music <strong[^>]*>till late<\/strong>\.<\/p><\/td><\/tr>/);
  });

  it("draws empty headings and copy, to be typed into; the email that's sent leaves them out", () => {
    expect(marked).toMatch(/<tr data-section="2">[\s\S]*?data-edit="heading"[^>]*><\/h2>/);
    expect(marked).toMatch(/<tr data-section="3"><td[^>]*data-edit="copy"[^>]*><p [^>]*><\/p><\/td>/);
    expect(render(sections).html.match(/<h2 /g)).toHaveLength(1);
  });

  it("empty pictures and buttons are dashed boxes saying what they need, and there's a place to add before each part and after the last", () => {
    const html = renderOneOffEmail(
      { subject: "S", sections: [{ kind: "image", assetId: "" }, { kind: "button", label: "", link: "" }] },
      { site, images, marks: true },
    ).html;
    expect(html).toMatch(/<tr data-section="0">[\s\S]*?<div data-waiting[^>]*>Picture: click here, then Change picture<\/div>/);
    expect(html).toMatch(/<tr data-section="1">[\s\S]*?<div data-waiting[^>]*>Button: click here to give it words and a link<\/div>/);
    expect(html.match(/<tr data-insert="(\d)">/g)).toEqual(['<tr data-insert="0">', '<tr data-insert="1">', '<tr data-insert="2">']);
    expect(render([{ kind: "image", assetId: "" }]).html).not.toContain("data-");
  });

  it("a row of photos shares the column, each cut to 4:5; an empty cell is a dashed box in the editor only", () => {
    const sections = [{ kind: "row", cells: [{ kind: "picture", assetId: ASSET, alt: "Pizza" }, { kind: "empty" }] }];
    const sent = render(sections).html;
    expect(sent).toMatch(/<td width="274"[^>]*><img src="[^"]+fit=crop[^"]*" width="274" alt="Pizza"[^>]*><\/td><td width="274"[^>]*><\/td>/);
    const marked = renderOneOffEmail({ subject: "S", sections }, { site, images, marks: true }).html;
    expect(marked).toMatch(/<td width="274" valign="top" data-cell="1"[^>]*><div data-waiting[^>]*>Empty<\/div>/);
    expect(render([{ kind: "row", cells: [{ kind: "empty" }, { kind: "picture", assetId: "" }] }]).html).not.toContain('width="274"');
  });

  it("a row with our logo and a × is the lockup: Gwenda × their logo, centred, each whole", () => {
    const html = render([{ kind: "row", cells: [{ kind: "logo" }, { kind: "times" }, { kind: "picture", assetId: ASSET, alt: "Pinsa A Roma" }] }]).html;
    expect(html).toMatch(/<img src="[^"]+\/brand\/logo-email-social\.png" width="130" alt="Gwenda"[^>]*><\/td><td[^>]*>&times;<\/td><td[^>]*><img src="[^"]+" width="130" alt="Pinsa A Roma"/);
    expect(render([{ kind: "row", cells: [{ kind: "logo" }, { kind: "times" }, { kind: "picture", assetId: ASSET, alt: "Pinsa A Roma" }] }]).text).toContain("GWENDA × [Pinsa A Roma]");
  });

  it("a row keeps two or three cells", () => {
    expect(SECTION_KINDS.row.clean({ cells: [{ kind: "logo" }] }).cells).toEqual([{ kind: "logo" }, { kind: "empty" }]);
    expect(SECTION_KINDS.row.clean({ cells: [1, 2, 3, 4].map(() => ({ kind: "times" })) }).cells).toHaveLength(3);
    expect(SECTION_KINDS.row.clean({ cells: [{ kind: "script" }, { kind: "picture", assetId: ASSET, extra: 1 }] }).cells).toEqual([
      { kind: "empty" },
      { kind: "picture", assetId: ASSET, alt: "" },
    ]);
  });

  it("an event card is drawn as the monthly email draws it: a night with its date sticker, a pop-up kitchen with its tag", () => {
    const night = render([
      { kind: "event", date: "2026-12-03", title: "Karaoke", when: "8pm – late", note: "Sing your heart out.", link: "https://gwenda.example/whats-on/karaoke/", assetId: ASSET },
    ]);
    expect(night.html).toMatch(/>Thu<\/td>[\s\S]*?>3<\/td>[\s\S]*?>Dec<\/td>/);
    expect(night.html).toMatch(/<a href="https:\/\/gwenda\.example\/whats-on\/karaoke\/"[^>]*>Karaoke<\/a>/);
    expect(night.html).toContain("8pm – late");
    expect(night.text).toContain("2026-12-03: Karaoke");
    const kitchen = render([{ kind: "event", tag: "Pop-up kitchen", title: "Pinsa A Roma", when: "Mondays and Tuesdays", link: "https://gwenda.example/whats-on/pinsa/" }]);
    expect(kitchen.html).toMatch(/>Pop-up kitchen<\/td>/);
    expect(kitchen.html).not.toMatch(/>Dec<\/td>/);
  });

  it("a divider is the monthly email's dashed line", () => {
    expect(render([{ kind: "divider" }]).html).toMatch(/border-top:1px dashed/);
    expect(render([{ kind: "divider" }]).text).toContain("----");
  });

  it("copy's paragraphs share one cell, each with the gap a row of its own had", () => {
    const html = render([{ kind: "copy", text: "One\n\nTwo" }]).html;
    expect(html).toMatch(/<td align="left" style="padding:0px \d+px 0px;"><p [^>]*margin:0 0 18px;[^>]*>One<\/p><p [^>]*margin:0 0 18px;[^>]*>Two<\/p><\/td>/);
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
      { kind: "button", label: "x".repeat(40), link: "https://a.example", look: "link" },
      { kind: "image", assetId: ASSET, alt: "A", size: "full" },
    ]);
    expect(cleanSections("nope")).toEqual([]);
    expect(cleanSections(Array.from({ length: 99 }, () => ({ kind: "copy", text: "x" }))).length).toBe(40);
  });

  it("each kind starts blank and cleans to itself", () => {
    for (const [id, kind] of Object.entries(SECTION_KINDS)) {
      const blank = kind.blank();
      expect(blank.kind).toBe(id);
      expect(kind.clean(blank)).toEqual(blank);
      // Book a table and a divider have nothing to fill in: whole as soon as they're added.
      expect(kind.empty(blank)).toBe(id !== "booking" && id !== "divider");
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
