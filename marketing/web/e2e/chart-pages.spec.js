import { expect, test } from "@playwright/test";

/**
 * Every page wears the site's look (#240): the numbered navigation across
 * the top (ChartNav) and the foot (ChartFooter), never the old header and
 * its menu (Menu, Featured artist, no Drinks, Food or Bookings). A wrong
 * address gets a page that says so, with a 404, not a copy of home.
 */

const PAGES = [
  "/privacy",
  "/acknowledgements",
  "/artists/current",
  "/contact/verify",
  "/contact/edit",
];

/** The site's navigation, the foot, and none of the old header. */
async function expectChart(page) {
  const nav = page.locator(".ch-bar");
  await expect(nav).toBeVisible();
  for (const label of ["What's on", "Drinks", "Food", "Bookings", "Contact"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.locator("footer.ch-footer")).toBeVisible();
  await expect(page.locator("#site-header, #site-header-nav")).toHaveCount(0);
}

test.describe("the site's look", () => {
  for (const path of PAGES) {
    test(`${path} has the navigation and the foot`, async ({ page }) => {
      await page.goto(path);
      await expectChart(page);
    });
  }

  test("the old schedule goes to What's on", async ({ page }) => {
    const response = await page.goto("/whats-on/schedule");
    await expect(page).toHaveURL(/\/whats-on\/?$/);
    expect(response?.status()).toBe(200);
    await expectChart(page);
  });
});

test.describe("a wrong address", () => {
  for (const path of ["/no-such-page", "/whats-on/no-such-night"]) {
    test(`${path} says there's nothing here, with a 404`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveURL(new RegExp(`${path}/?$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Nothing here",
      );
      await expectChart(page);
      // The way on: the five places, each to its page (Bookings to home's)
      const places = page.getByRole("navigation", { name: "Try instead" });
      for (const [label, href] of [
        ["What's on", "/whats-on"],
        ["Drinks", "/bar"],
        ["Food", "/kitchen"],
        ["Bookings", "/#bookings"],
        ["Contact", "/contact"],
      ]) {
        await expect(
          places.getByRole("link", { name: new RegExp(label) }),
        ).toHaveAttribute("href", href);
      }
    });
  }
});
