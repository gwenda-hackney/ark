import { expect, test } from "@playwright/test";

/**
 * The links in a form's emails (#240): /contact/verify confirms the address,
 * /contact/edit opens the application again. Each reads its link's token and
 * asks the forms API. Going on to another page and coming Back with the
 * browser's Back button must do that again, not leave the page on
 * "Confirming…".
 */

/** What the forms API answers for a good link. */
const CONFIRMED = {
  ok: true,
  successTitle: "You're confirmed",
  successMessage: "Thanks for writing. We'll be in touch.",
  formPath: "/contact/play",
};

const title = (page) => page.getByRole("heading", { level: 1 });

test.describe("the confirm link", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/forms/verify?*", (route) =>
      route.fulfill({ json: CONFIRMED }),
    );
  });

  test("confirms the address", async ({ page }) => {
    await page.goto("/contact/verify?t=a-good-token");
    await expect(title(page)).toHaveText("You're confirmed");
    await expect(page.getByText(CONFIRMED.successMessage)).toBeVisible();
  });

  test("confirms again after going on and coming Back", async ({ page }) => {
    await page.goto("/contact/verify?t=a-good-token");
    await expect(title(page)).toHaveText("You're confirmed");

    // On to home, in the same page (the site's router), and Back
    await page.evaluate(() => {
      /** @type {any} */ (window).__e2eSameDocument = true;
    });
    await page.getByRole("link", { name: "Back to Gwenda" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/contact\/verify\?t=a-good-token$/);

    await expect(title(page)).toHaveText("You're confirmed");
    // The router brought the page back: no full reload ran its script anew
    expect(
      await page.evaluate(() => /** @type {any} */ (window).__e2eSameDocument),
    ).toBe(true);
  });

  test("says so when the link has no token", async ({ page }) => {
    await page.goto("/contact/verify");
    await expect(title(page)).toHaveText("This link isn't valid");
  });
});

test.describe("the edit link", () => {
  test("opens the form", async ({ page }) => {
    await page.route("**/api/forms/edit?*", (route) =>
      route.fulfill({ json: { ok: true, formPath: "/contact/play" } }),
    );
    await page.goto("/contact/edit?t=a-good-token");
    await expect(page).toHaveURL(/\/contact\/play$/);
  });

  test("says so when the link has no token", async ({ page }) => {
    await page.goto("/contact/edit");
    await expect(title(page)).toHaveText("This link isn't valid");
  });
});
