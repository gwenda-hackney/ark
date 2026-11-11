import { describe, expect, it } from "vitest";
import { weeklyEmailModel } from "./model.js";
import { emailImageUrl, MAILCHIMP_TAGS, renderWeeklyEmail } from "./render.js";
import { night, testCatalog } from "./testing.js";

const model = weeklyEmailModel(testCatalog(), { today: "2026-11-10" });
const email = renderWeeklyEmail(model);

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

function attr(tag, name) {
  return new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
}

describe("renderWeeklyEmail: subject and preview line", () => {
  it("names two or three of the week's nights", () => {
    expect(email.subject).toBe("This week at Gwenda: Negroni Society, Karaoke with Ross, EPIC Jam");
    expect(email.html).toContain(`<title>${email.subject}</title>`);
  });

  it("keeps a long week's subject short, with the first night always in", () => {
    const catalog = testCatalog();
    catalog.occurrences.push(
      night("2026-11-10", "long", "A Very Long Name For A Night That Goes On And On And On, Volume Two"),
    );
    const subject = renderWeeklyEmail(weeklyEmailModel(catalog, { today: "2026-11-10" })).subject;
    expect(subject.length).toBeLessThanOrEqual(110);
    expect(subject).toMatch(/^This week at Gwenda: /);
  });

  it("goes through the week in the preview line, deal last", () => {
    expect(email.preheader).toBe(
      "Tonight: Negroni Society · Thu: Karaoke with Ross · Sat–Sun: EPIC Jam · Cocktail Hour, Wed to Sat, 5–6:30pm",
    );
    expect(email.html).toContain("Tonight: Negroni Society · Thu: Karaoke with Ross");
  });
});

describe("renderWeeklyEmail: the HTML is email HTML", () => {
  it("links only to absolute addresses or Mailchimp's merge tags", () => {
    const links = tags(email.html, "a").map((tag) => attr(tag, "href"));
    expect(links.length).toBeGreaterThan(10);
    for (const link of links) {
      expect(link).toMatch(/^(https:\/\/[^\s"]+|\*\|[A-Z_:]+\|\*)$/);
    }
  });

  it("gives every picture an absolute address, alt text and a width", () => {
    const images = tags(email.html, "img");
    // The logo, the karaoke flyer, the jam photo, the deal's flyer
    expect(images).toHaveLength(4);
    for (const tag of images) {
      expect(attr(tag, "src")).toMatch(/^https:\/\//);
      expect(attr(tag, "alt")).toBeTruthy();
      expect(Number(attr(tag, "width"))).toBeGreaterThan(0);
      expect(attr(tag, "style")).toContain("height:auto");
    }
  });

  it("asks the image CDN for a sized picture: a flyer whole, a photo 4:5", () => {
    const flyer = new URL(emailImageUrl({ url: "https://cdn.sanity.io/images/p/d/a-1132x1600.jpg", whole: true }, 400));
    expect(Object.fromEntries(flyer.searchParams)).toEqual({ w: "800", fm: "jpg", bg: "ffffff", q: "80", auto: "format" });
    const photo = new URL(
      emailImageUrl({ url: "https://cdn.sanity.io/images/p/d/b-1600x1200.jpg?fp-x=0.250&fp-y=0.500", whole: false }, 100),
    );
    expect(Object.fromEntries(photo.searchParams)).toMatchObject({ w: "200", h: "250", fit: "crop", crop: "focalpoint" });
    expect(emailImageUrl({ url: "javascript:alert(1)" }, 100)).toBe("");
    expect(emailImageUrl(null, 100)).toBe("");
  });

  it("asks for twice the width it shows, whatever the address asked for before, and never more than the picture has", () => {
    // As the website's own data has a flyer: already 1600px wide.
    const sized = new URL(emailImageUrl({ url: "https://cdn.sanity.io/images/p/d/a-1132x1600.jpg?w=1600&q=86&auto=format", whole: true }, 100));
    expect(sized.searchParams.getAll("w")).toEqual(["200"]);
    expect(sized.searchParams.getAll("q")).toEqual(["80"]);
    // A small flyer isn't stretched: the CDN would only blur it, for more bytes.
    const small = new URL(emailImageUrl({ url: "https://cdn.sanity.io/images/p/d/a-630x630.png", whole: true }, 400));
    expect(small.searchParams.get("w")).toBe("630");
    const photo = new URL(emailImageUrl({ url: "https://cdn.sanity.io/images/p/d/b-600x1200.jpg", whole: false }, 400));
    expect(Object.fromEntries(photo.searchParams)).toMatchObject({ w: "600", h: "750", fit: "crop" });
  });

  it("lays out with presentation tables and inline styles, one column up to 600px", () => {
    const tables = tags(email.html, "table");
    expect(tables.length).toBeGreaterThan(10);
    for (const tag of tables) expect(attr(tag, "role")).toBe("presentation");
    expect(email.html).toContain("max-width:600px");
    expect(email.html).not.toMatch(/<(script|form|iframe|video)\b/i);
    expect(email.html).not.toMatch(/position:\s*(absolute|fixed)|display:\s*(flex|grid)/i);
  });

  it("says its language, stays dark, and never flashes white", () => {
    expect(email.html).toMatch(/<html lang="en-GB"/);
    expect(email.html).toContain('<meta name="color-scheme" content="dark">');
    expect(email.html).toMatch(/<body bgcolor="#1a1510"/);
    expect(email.html).not.toMatch(/(background-color|bgcolor)[:=]\s*"?#(fff|ffffff)\b/i);
  });

  it("has the Outlook button and the web fonts kept from Outlook", () => {
    expect(email.html).toContain("<v:roundrect");
    expect(email.html).toMatch(/<!--\[if !mso\]><!--><link href="https:\/\/fonts\.googleapis\.com/);
    expect(email.html).toContain(">Book a table</a>");
  });

  it("carries what Mailchimp needs to send it: unsubscribe, details, postal address", () => {
    for (const tag of [MAILCHIMP_TAGS.unsubscribe, MAILCHIMP_TAGS.updateProfile, MAILCHIMP_TAGS.addressLine]) {
      expect(email.html).toContain(tag);
      expect(email.text).toContain(tag);
    }
    expect(email.html).toContain('href="*|UNSUB|*"');
  });

  it("stays well under the size Gmail clips at (102 KB)", () => {
    expect(Buffer.byteLength(email.html)).toBeLessThan(80 * 1024);
  });

  it("has every section, in the site's words", () => {
    for (const words of ["What’s on this week", "We’re shut on Mondays", "Deals", "Pop-up kitchen", "Next week", "Tonight"]) {
      expect(email.html).toContain(words);
    }
    expect(email.html).toContain("Sat 12–8pm · Sun 1–6pm");
    expect(email.html).toContain("£8 Negroni");
    // A deal that runs four days is there once
    expect(email.html.match(/>Cocktail Hour<\/a>/g)).toHaveLength(1);
  });

  it("escapes what editors type", () => {
    const catalog = testCatalog();
    catalog.occurrences.push(night("2026-11-10", "x", `Rock & <b>Roll</b> "Night"`, { offer: "2 < 3" }));
    const html = renderWeeklyEmail(weeklyEmailModel(catalog, { today: "2026-11-10" })).html;
    expect(html).toContain("Rock &amp; &lt;b&gt;Roll&lt;/b&gt; &quot;Night&quot;");
    expect(html).not.toContain("<b>Roll</b>");
  });
});

describe("renderWeeklyEmail: the top", () => {
  it("centres the heading and the week's dates under the centred logo", () => {
    const top = email.html.slice(email.html.indexOf("Hackney Wick</div>"), email.html.indexOf("We’re shut on Mondays"));
    // The heading's row, its own table (the stroke under it) and its words
    expect(top).toMatch(/<td align="center"[^>]*><table [^>]*align="center"[^>]*style="[^"]*margin:0 auto;[^"]*"><tr><td [^>]*><h1 [^>]*text-align:center;/);
    // The dates under it
    expect(top.slice(top.lastIndexOf("<p "))).toContain("text-align:center;");
  });
});

describe("renderWeeklyEmail: missing data", () => {
  it("renders a week with nothing on", () => {
    const empty = renderWeeklyEmail(weeklyEmailModel({ series: [], occurrences: [] }, { today: "2026-11-09" }));
    expect(empty.subject).toBe("What’s on at Gwenda");
    expect(empty.html).toContain("Nothing in the diary");
    expect(empty.html).not.toContain(">Deals<");
    expect(empty.html).not.toContain(">Next week<");
    expect(empty.html).toContain("*|UNSUB|*");
    expect(empty.text).toContain("Nothing in the diary");
  });

  it("renders nights with no hours, line, offer, picture or series", () => {
    const bare = { id: "bare", title: "Bare night", date: "2026-11-11", category: "event" };
    const out = renderWeeklyEmail(weeklyEmailModel({ occurrences: [bare] }, { today: "2026-11-09" }));
    expect(out.html).toContain("Bare night");
    expect(out.html).toContain('href="https://gwenda.co.uk/whats-on"');
    expect(out.html).not.toContain("undefined");
    expect(out.text).not.toContain("undefined");
  });

  it("uses the logo and the merge tags it's given", () => {
    const out = renderWeeklyEmail(model, {
      logoUrl: "https://cdn.example.com/logo.png",
      tags: { unsubscribe: "https://example.com/u", updateProfile: "https://example.com/p", archive: "https://example.com/a", addressLine: "1 Example St" },
    });
    expect(out.html).toContain('src="https://cdn.example.com/logo.png"');
    expect(out.html).not.toContain("*|");
    expect(out.html).toContain("1 Example St");
  });

  it("has a plain-text copy with every night and its link", () => {
    expect(email.text).toContain("Tonight, Tue 10 Nov: Negroni Society");
    expect(email.text).toContain("Sat–Sun 14–15 Nov: EPIC Jam");
    expect(email.text).toContain("https://gwenda.co.uk/whats-on/karaoke");
    expect(email.text).toContain("See the menu: https://gwenda.co.uk/kitchen");
    expect(email.text).not.toMatch(/<[a-z]/i);
  });
});
