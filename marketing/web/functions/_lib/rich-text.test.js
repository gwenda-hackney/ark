import { describe, expect, it } from "vitest";
import {
  plainToRich,
  portableTextToRich,
  richParagraphHtml,
  richToHtml,
  richToPlain,
  safeHref,
} from "./rich-text.js";

const span = (text, marks = []) => ({ _type: "span", text, marks });
const block = (children, extra = {}) => ({
  _type: "block",
  style: "normal",
  markDefs: [],
  children,
  ...extra,
});
const link = (key, href) => ({ _type: "link", _key: key, href });

describe("portableTextToRich", () => {
  it("keeps bold, italic, links and line breaks, and groups bullets", () => {
    const value = [
      block([
        span("Doors at "),
        span("8pm", ["strong"]),
        span(", "),
        span("sets", ["em"]),
        span(" till late.\nUpstairs."),
      ]),
      block([span("Tickets"), span(" here", ["k1"])], {
        markDefs: [link("k1", "https://gwenda.co.uk/whats-on")],
      }),
      block([span("Open decks")], { listItem: "bullet", level: 1 }),
      block([span("Chess")], { listItem: "bullet", level: 1 }),
      block([span("After the list")]),
    ];
    expect(portableTextToRich(value)).toBe(
      "Doors at **8pm**, *sets* till late.\nUpstairs.\n\n" +
        "Tickets[ here](https://gwenda.co.uk/whats-on)\n\n" +
        "- Open decks\n- Chess\n\n" +
        "After the list",
    );
  });

  it("escapes characters that would read as marks", () => {
    expect(portableTextToRich([block([span("2*3 [note] \\ ok")])])).toBe(
      "2\\*3 \\[note\\] \\\\ ok",
    );
    expect(plainToRich("Cocktails*")).toBe("Cocktails\\*");
    expect(portableTextToRich("Old *plain* text")).toBe("Old \\*plain\\* text");
  });

  it("drops unsafe links to their text, and turns headings and numbers into what the set has", () => {
    expect(
      portableTextToRich([
        block([span("click", ["x"])], {
          markDefs: [link("x", "javascript:alert(1)")],
        }),
        block([span("Line-up")], { style: "h2" }),
        block([span("One")], { listItem: "number", level: 1 }),
      ]),
    ).toBe("click\n\nLine-up\n\n- One");
  });
});

describe("richToHtml", () => {
  it("renders paragraphs, line breaks, marks, lists and links", () => {
    expect(
      richToHtml(
        "Doors at **8pm**, *late*.\nUpstairs.\n\n- Open decks\n- [Chess](/whats-on/chess)",
      ),
    ).toBe(
      "<p>Doors at <strong>8pm</strong>, <em>late</em>.<br>Upstairs.</p>" +
        '<ul><li>Open decks</li><li><a href="/whats-on/chess">Chess</a></li></ul>',
    );
  });

  it("opens outside links in a new tab", () => {
    expect(richParagraphHtml("[Tickets](https://dice.fm/x)")).toBe(
      '<p><a href="https://dice.fm/x" target="_blank" rel="noopener">Tickets</a></p>',
    );
  });

  it("escapes HTML and never renders an unsafe link", () => {
    expect(
      richParagraphHtml(
        "<script>x</script> [go](javascript:alert%281%29) [m](mailto:a@b.co)",
      ),
    ).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt; go <a href="mailto:a@b.co">m</a></p>',
    );
    expect(richParagraphHtml('[x](https://a.co/"onmouseover="y)')).toBe(
      '<p><a href="https://a.co/&quot;onmouseover=&quot;y" target="_blank" rel="noopener">x</a></p>',
    );
  });

  it("shows escaped characters literally and survives unclosed marks", () => {
    expect(richParagraphHtml("2\\*3 \\[a\\]")).toBe("<p>2*3 [a]</p>");
    expect(richParagraphHtml("**open")).toBe("<p><strong>open</strong></p>");
    expect(richParagraphHtml("[not a link")).toBe("<p>[not a link</p>");
  });
});

describe("richToPlain", () => {
  it("drops marks, writes links out and bullets as •", () => {
    expect(
      richToPlain(
        "**Doors** 8pm.\n\n- Open decks\n- [Tickets](https://dice.fm/x)\n\nMail [us](mailto:hi@gwenda.co.uk)",
      ),
    ).toBe(
      "Doors 8pm.\n\n• Open decks\n• Tickets (https://dice.fm/x)\n\nMail us (hi@gwenda.co.uk)",
    );
  });

  it("doesn't repeat a link whose text is its address", () => {
    expect(richToPlain("[https://gwenda.co.uk](https://gwenda.co.uk)")).toBe(
      "https://gwenda.co.uk",
    );
  });

  it("round-trips plain text exactly", () => {
    const plain = "Cocktails* and [notes] \\ here.\nNew line.";
    expect(richToPlain(plainToRich(plain))).toBe(plain);
  });
});

describe("safeHref", () => {
  it("allows web, mail, phone and site links only", () => {
    expect(safeHref("https://x.co")).toBe("https://x.co");
    expect(safeHref("/whats-on")).toBe("/whats-on");
    expect(safeHref("tel:+442071234567")).toBe("tel:+442071234567");
    expect(safeHref("//evil.co")).toBe("");
    expect(safeHref("javascript:alert(1)")).toBe("");
    expect(safeHref("data:text/html,x")).toBe("");
  });
});
