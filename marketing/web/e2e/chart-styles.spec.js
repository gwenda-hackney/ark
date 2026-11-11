import { expect, test } from "@playwright/test";

/**
 * What the new look (#240) must keep for everyone, whatever they browse
 * with: the keyboard can always see where it is, a thumb can hit every link,
 * and a link coloured as a link reads as one.
 */

/** The colour a token on the page resolves to, as computed styles give it. */
function tokenColour(page, token) {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.querySelector(".ch-page").append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

/**
 * Where the keyboard is now, and how it shows: the focused element's
 * outline and box shadow. Null on the page itself, and on the dev toolbar
 * (it is only in dev, and it is the last stop).
 */
function focusStop(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el.localName === "astro-dev-toolbar") {
      return null;
    }
    const cs = getComputedStyle(el);
    const name = (el.innerText || el.getAttribute("aria-label") || el.name)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 40);
    return {
      name: `${el.localName}${el.className ? `.${String(el.className).split(" ")[0]}` : ""} "${name}"`,
      id: [...document.querySelectorAll("*")].indexOf(el),
      outlineStyle: cs.outlineStyle,
      outlineWidth: parseFloat(cs.outlineWidth),
      outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow,
    };
  });
}

/** It shows the one ring: a solid outline in the ring's colour, or the same as a box shadow. */
function showsRing(stop, ring) {
  const outline =
    stop.outlineStyle !== "none" &&
    stop.outlineWidth >= 2 &&
    stop.outlineColor === ring;
  const shadow = stop.boxShadow.includes(ring);
  return outline || shadow;
}

test.describe("the keyboard's ring", () => {
  for (const width of [1440, 800]) {
    for (const path of ["/bar", "/contact"]) {
      test(`marks every stop on ${path} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.locator(".ch-page")).toBeVisible();
        const ring = await tokenColour(page, "--ch-mustard");

        const stops = [];
        const seen = new Set();
        for (let i = 0; i < 150; i++) {
          await page.keyboard.press("Tab");
          const stop = await focusStop(page);
          if (!stop) {
            if (stops.length) break;
            continue;
          }
          if (seen.has(stop.id)) break;
          seen.add(stop.id);
          stops.push(stop);
        }

        expect(
          stops.length,
          "the page has stops to tab through",
        ).toBeGreaterThan(10);
        const unmarked = stops
          .filter((stop) => !showsRing(stop, ring))
          .map(
            (stop) =>
              `${stop.name}: outline ${stop.outlineWidth}px ${stop.outlineStyle} ${stop.outlineColor}`,
          );
        expect(unmarked, "stops without the ring").toEqual([]);
      });
    }
  }
});

test.describe("a thumb's targets, wherever the dock shows", () => {
  test.use({ viewport: { width: 800, height: 900 } });

  /**
   * Each link is at least 44px tall: the size a fingertip needs. Measured
   * upright, so a link set at a tilt ("More →") can't pass on its slant.
   */
  async function expectFullSize(page, selector) {
    const links = page.locator(selector);
    await expect(links.first()).toBeAttached();
    const heights = await links.evaluateAll((all) =>
      all.map((a) => {
        const tilt = a.style.transform;
        a.style.transform = "none";
        const height = a.getBoundingClientRect().height;
        a.style.transform = tilt;
        return {
          text: a.innerText.trim().replace(/\s+/g, " ").slice(0, 30),
          height: Math.round(height * 10) / 10,
        };
      }),
    );
    const small = heights.filter((link) => link.height < 44);
    expect(small, `${selector}: links under 44px tall`).toEqual([]);
  }

  test("the drinks menu's chapter links", async ({ page }) => {
    await page.goto("/bar");
    await expectFullSize(page, ".ch-jump a");
  });

  test("the deals' and the kitchen's links on What's on", async ({ page }) => {
    await page.goto("/whats-on");
    await expectFullSize(page, ".ch-stand-links a");
  });

  test("an event page's way back to What's on", async ({ page }) => {
    await page.goto("/whats-on");
    const href = await page
      .locator(".ch-night-card")
      .first()
      .getAttribute("href");
    await page.goto(href);
    await expectFullSize(page, ".ch-event-back a");
  });

  test("home's menu tiles, the rest of the menu and the photos' More", async ({
    page,
  }) => {
    await page.goto("/");
    await expectFullSize(page, ".ch-menu-more a");
    await expectFullSize(page, ".ch-menu-rest");
    await expectFullSize(page, ".ch-menu-side-head h3 a");
    await expectFullSize(page, ".ch-photos-more-link");
  });
});

test.describe("Contact's own links", () => {
  test("are in the gold, like a link", async ({ page }) => {
    await page.goto("/contact");
    const gold = await tokenColour(page, "--ch-gold");
    const also = page.locator(".ch-contact-also");
    await expect(also.getByRole("link", { name: "@gwendahackney" })).toHaveCSS(
      "color",
      gold,
    );
    await expect(also.getByRole("link", { name: /@gwenda\.co\.uk/ })).toHaveCSS(
      "color",
      gold,
    );
  });
});
