import { expect, test } from "@playwright/test";
import { arrived, settle } from "./support.js";

/**
 * Home's numbered links (#240), on the hero and on the bar that slides in on
 * the way back up, go down the page to each place's section: the page glides
 * there (instantly with reduced motion), lands the section clear of the top,
 * and focus follows. Going on to another page and coming Back must leave them
 * working the same way.
 */

/** Air the landing keeps above a section: scroll-margin-top in chart.css. */
const LANDING_AIR = 16;

/**
 * Do something, and return every scroll position the page passed through on
 * the way, from where it started to where it came to rest. The window lives
 * on across the router's page changes, so this follows a Back too.
 */
async function scrollPath(page, act) {
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    if (w.__e2eRecord) removeEventListener("scroll", w.__e2eRecord);
    const path = [Math.round(scrollY)];
    w.__e2ePath = path;
    w.__e2eRecord = () => path.push(Math.round(scrollY));
    addEventListener("scroll", w.__e2eRecord, { passive: true });
  });
  await act();
  await settle(page);
  return page.evaluate(() => /** @type {any} */ (window).__e2ePath);
}

/** Positions passed through strictly between the start and the end. */
function between(path) {
  const from = path[0];
  const to = path[path.length - 1];
  const low = Math.min(from, to) + 1;
  const high = Math.max(from, to) - 1;
  return new Set(path.filter((y) => y > low && y < high)).size;
}

/**
 * The page glided: it passed through positions on its way. A busy machine
 * draws few frames, so a few are enough; a jump has none.
 */
function expectGlide(path) {
  expect(
    between(path),
    `the page should glide, not jump (passed through ${path.join(", ")})`,
  ).toBeGreaterThanOrEqual(2);
}

/** The page jumped: nothing in between. */
function expectJump(path) {
  expect(
    between(path),
    `the page should jump, not glide (passed through ${path.join(", ")})`,
  ).toBeLessThanOrEqual(1);
}

/** The section is at the top, clear of it, with the keyboard in it. */
async function expectLanded(page, id) {
  const top = await page.evaluate(
    (id) => document.getElementById(id)?.getBoundingClientRect().top ?? NaN,
    id,
  );
  expect(top, `#${id} lands at the top`).toBeGreaterThanOrEqual(0);
  expect(top, `#${id} lands at the top`).toBeLessThan(LANDING_AIR * 2);
  await expect
    .poll(() =>
      page.evaluate(
        (id) => document.getElementById(id)?.contains(document.activeElement),
        id,
      ),
    )
    .toBe(true);
}

const hero = (page) => page.locator("#hero");
const bar = (page) => page.locator(".ch-bar");

const arrivedHome = (page) => arrived(page, ".ch-home #hero");

async function openHome(page) {
  await page.goto("/");
  await arrivedHome(page);
}

/** The visitor scrolls back up to the top with the wheel. */
async function wheelToTop(page) {
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await settle(page);
}

/** Past the hero, a little scroll back up brings home's bar in. */
async function bringBarIn(page) {
  await page.mouse.move(200, 200);
  await page.mouse.wheel(0, -300);
  await expect(page.locator(".ch-page")).toHaveAttribute(
    "data-reveal",
    "shown",
  );
  await settle(page);
}

/** Ways to go on from home to another page. */
const waysOut = [
  {
    name: "a section's own link on to its page",
    async leave(page) {
      await hero(page)
        .getByRole("link", { name: /Drinks/ })
        .click();
      await settle(page);
      await page
        .locator("#drinks")
        .getByRole("link", { name: /All the drinks/ })
        .click();
      await expect(page).toHaveURL(/\/bar$/);
      await arrived(page, ".ch-page:not(.ch-home)");
    },
  },
  {
    name: "the hero's Contact",
    async leave(page) {
      await hero(page)
        .getByRole("link", { name: /Contact/ })
        .click();
      await expect(page).toHaveURL(/\/contact$/);
      await arrived(page, ".ch-page:not(.ch-home)");
    },
  },
  {
    name: "the bar's Contact",
    async leave(page) {
      await hero(page).getByRole("link", { name: /Food/ }).click();
      await settle(page);
      await bringBarIn(page);
      await bar(page)
        .getByRole("link", { name: /Contact/ })
        .click();
      await expect(page).toHaveURL(/\/contact$/);
      await arrived(page, ".ch-page:not(.ch-home)");
    },
  },
];

test.describe("home's links down the page", () => {
  test("glide to their sections on a first visit", async ({ page }) => {
    await openHome(page);
    const path = await scrollPath(page, () =>
      hero(page).getByRole("link", { name: /Food/ }).click(),
    );
    expectGlide(path);
    await expectLanded(page, "food");
  });

  for (const way of waysOut) {
    test(`still glide after ${way.name}, then Back`, async ({ page }) => {
      await openHome(page);
      await way.leave(page);

      // Back lands where the visitor left, in one go
      const back = await scrollPath(page, async () => {
        await page.goBack();
        await arrivedHome(page);
      });
      expectJump(back);

      // The hero's links, from the top
      await wheelToTop(page);
      const down = await scrollPath(page, () =>
        hero(page).getByRole("link", { name: /Food/ }).click(),
      );
      expectGlide(down);
      await expectLanded(page, "food");

      // And the bar's, on the way back up
      await bringBarIn(page);
      const up = await scrollPath(page, () =>
        bar(page)
          .getByRole("link", { name: /What.s on/ })
          .click(),
      );
      expectGlide(up);
      await expectLanded(page, "whats-on");
    });
  }

  test("still glide after leaving by a full page load, then Back", async ({
    page,
  }) => {
    await openHome(page);
    // Somewhere the router doesn't take (another site, a hard link)
    await page.goto("/contact");
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await arrivedHome(page);

    const down = await scrollPath(page, () =>
      hero(page).getByRole("link", { name: /Food/ }).click(),
    );
    expectGlide(down);
    await expectLanded(page, "food");
  });
});

test.describe("home's links down the page, with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("jump straight to their sections, before and after a Back", async ({
    page,
  }) => {
    await openHome(page);
    const first = await scrollPath(page, () =>
      hero(page).getByRole("link", { name: /Food/ }).click(),
    );
    expectJump(first);
    await expectLanded(page, "food");

    await waysOut[0].leave(page);
    await page.goBack();
    await arrivedHome(page);
    await wheelToTop(page);

    const again = await scrollPath(page, () =>
      hero(page).getByRole("link", { name: /Food/ }).click(),
    );
    expectJump(again);
    await expectLanded(page, "food");
  });
});
