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
      // The way on: the five places, each to its page
      const places = page.getByRole("navigation", { name: "Try instead" });
      for (const [label, href] of [
        ["What's on", "/whats-on"],
        ["Drinks", "/bar"],
        ["Food", "/kitchen"],
        ["Bookings", "/bookings"],
        ["Contact", "/contact"],
      ]) {
        await expect(
          places.getByRole("link", { name: new RegExp(label) }),
        ).toHaveAttribute("href", href);
      }
    });
  }
});

test.describe("one job per place", () => {
  test("home's Bookings links on to its page, by the heading, as Photos does", async ({
    page,
  }) => {
    await page.goto("/");
    const more = page
      .locator("#bookings .ch-home-head")
      .getByRole("link", { name: "More on bookings" });
    await expect(more).toHaveAttribute("href", "/bookings");
    await expect(more).toHaveClass(/\bch-photos-more-link\b/);
  });

  test("Bookings has the party and the play, each with its way to the form", async ({
    page,
  }) => {
    await page.goto("/bookings");
    await expect(
      page.locator("#party").getByRole("link", { name: "Book your party" }),
    ).toHaveAttribute("href", "/contact/party");
    await expect(
      page.locator("#play").getByRole("link", { name: "Apply to play" }),
    ).toHaveAttribute("href", "/contact/play");
  });

  test("Contact is finding us and the list, not a party or playing", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.locator("#find-us")).toBeVisible();
    await expect(page.locator("#list")).toBeVisible();
    await expect(page.locator("#party, #play")).toHaveCount(0);
    const main = page.locator("main");
    await expect(
      main.locator('a[href^="/contact/party"], a[href^="/contact/play"]'),
    ).toHaveCount(0);
  });

  for (const path of ["/contact/party", "/contact/play"]) {
    test(`${path} is in Bookings in the navigation`, async ({ page }) => {
      await page.goto(path);
      const nav = page.locator(".ch-bar");
      await expect(nav.getByRole("link", { name: "Bookings" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(
        nav.getByRole("link", { name: "Contact" }),
      ).not.toHaveAttribute("aria-current", /.+/);
    });
  }

  test("the foot's Play here goes to Bookings' play half", async ({ page }) => {
    await page.goto("/bar");
    await expect(
      page.locator(".ch-footer").getByRole("link", { name: "Play here" }),
    ).toHaveAttribute("href", "/bookings#play");
  });
});
