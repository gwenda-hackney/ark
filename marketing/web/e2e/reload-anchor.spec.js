import { expect, test } from "@playwright/test";
import { PHONE, arrived, settle } from "./support.js";

/**
 * A reload of an address with an #anchor (/#bookings, /bookings#play,
 * /contact#list) lands that section at the top, under what's fixed there,
 * just as following a link to it does, wherever the visitor had scrolled
 * before the reload. It's still there once the page has settled: the fonts
 * set, the images in, home's hero come in piece by piece. A reload without
 * an anchor keeps the visitor's place, and Back and Forward still put each
 * page back where it was left.
 */

/** How far from its place a landing may be, in px. */
const NEAR = 3;

/**
 * The page has finished coming in: loaded, its fonts set, its images and
 * entrance done, and still.
 */
async function settled(page) {
  await page.waitForLoadState("load");
  await page.evaluate(async () => {
    const images = [...document.images]
      .filter((img) => img.loading !== "lazy" && !img.complete)
      .map(
        (img) =>
          new Promise((done) => {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }),
      );
    const entrances = document
      .getAnimations()
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
      .map((a) => a.finished.catch(() => undefined));
    await Promise.race([
      Promise.all([document.fonts.ready, ...images, ...entrances]),
      new Promise((done) => setTimeout(done, 5000)),
    ]);
  });
  await settle(page);
}

/**
 * Where the section's top is, and where a jump to it puts it: under what's
 * fixed at the top (the bar, or the corner button on a phone: the root's
 * scroll padding, chart.css), with the section's own air above it.
 */
function landing(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no #${id}`);
    const px = (value) => Number.parseFloat(value) || 0;
    return {
      top: el.getBoundingClientRect().top,
      wanted:
        px(getComputedStyle(document.documentElement).scrollPaddingTop) +
        px(getComputedStyle(el).scrollMarginTop),
    };
  }, id);
}

async function expectLanded(page, id, when) {
  const { top, wanted } = await landing(page, id);
  expect(
    Math.abs(top - wanted),
    `#${id} ${when}: its top is at ${top}px, under the top bar is ${wanted}px`,
  ).toBeLessThanOrEqual(NEAR);
}

/**
 * The visitor scrolls with the wheel, and the router keeps the place they
 * got to (what it puts back on a Back, and on a reload).
 */
async function scrollBy(page, dy) {
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, dy);
  await settle(page);
  await expect
    .poll(() => page.evaluate(() => history.state?.scrollY === scrollY))
    .toBe(true);
  return page.evaluate(() => scrollY);
}

const anchors = [
  { name: "home's Bookings", path: "/#bookings", id: "bookings" },
  {
    name: "Bookings' Play here, on a phone",
    path: "/bookings#play",
    id: "play",
    viewport: PHONE,
  },
  {
    name: "Contact's Get on the list, on a phone",
    path: "/contact#list",
    id: "list",
    viewport: PHONE,
  },
];

for (const { name, path, id, viewport } of anchors) {
  test.describe(`a reload of ${path}`, () => {
    if (viewport) test.use({ viewport });

    test(`lands on ${name}, wherever the visitor had scrolled`, async ({
      page,
    }) => {
      await page.goto(path);
      await settled(page);
      await expectLanded(page, id, "on arrival");

      // Up the page, away from the section
      const away = await scrollBy(page, -400);
      expect((await landing(page, id)).top).toBeGreaterThan(300);

      await page.reload();
      await settled(page);
      await expectLanded(page, id, `after a reload from ${away}px`);

      // And it stays there
      await page.waitForTimeout(1500);
      await settle(page);
      await expectLanded(page, id, "once the page has settled");
    });
  });
}

test.describe("a reload of an anchor, with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("lands on it too", async ({ page }) => {
    await page.goto("/#bookings");
    await settled(page);
    await scrollBy(page, -400);
    await page.reload();
    await settled(page);
    await expectLanded(page, "bookings", "after a reload");
  });
});

test.describe("a reload without an anchor", () => {
  test.use({ viewport: PHONE });

  test("keeps the visitor's place", async ({ page }) => {
    await page.goto("/contact");
    await settled(page);
    const place = await scrollBy(page, 900);
    expect(place).toBeGreaterThan(0);

    await page.reload();
    await settled(page);
    expect(
      Math.abs((await page.evaluate(() => scrollY)) - place),
    ).toBeLessThanOrEqual(NEAR);
  });
});

test("after a reload of an anchor, Back and Forward put each page back where it was left", async ({
  page,
}) => {
  await page.goto("/#bookings");
  await page.reload();
  await settled(page);
  await expectLanded(page, "bookings", "after a reload");

  // Up a little: home's bar comes in, and the visitor goes on by it
  const homePlace = await scrollBy(page, -300);
  await expect(page.locator(".ch-page")).toHaveAttribute(
    "data-reveal",
    "shown",
  );
  await page
    .locator(".ch-bar")
    .getByRole("link", { name: /Contact/ })
    .click();
  await expect(page).toHaveURL(/\/contact$/);
  await arrived(page, ".ch-page:not(.ch-home)");
  const contactPlace = await scrollBy(page, 600);
  expect(contactPlace).toBeGreaterThan(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/#bookings$/);
  await arrived(page, ".ch-home #hero");
  expect(
    Math.abs((await page.evaluate(() => scrollY)) - homePlace),
    "Back puts home where the visitor left it, not on #bookings",
  ).toBeLessThanOrEqual(NEAR);

  await page.goForward();
  await expect(page).toHaveURL(/\/contact$/);
  await arrived(page, ".ch-page:not(.ch-home)");
  expect(
    Math.abs((await page.evaluate(() => scrollY)) - contactPlace),
    "Forward puts Contact where the visitor left it",
  ).toBeLessThanOrEqual(NEAR);
});
