import { expect, test } from "@playwright/test";
import { PHONE, arrived } from "./support.js";

/**
 * Going from page to page through the router (#240): each page starts as a
 * new visit, whatever the visit before it was, and leaves nothing of itself
 * behind.
 */

/**
 * How many listeners for `type` are on the document or the window, as the
 * browser's own tools count them.
 *
 * @param {import("@playwright/test").Page} page
 * @param {"document" | "window"} on
 * @param {string} type
 */
async function listeners(page, on, type) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { result } = await cdp.send("Runtime.evaluate", { expression: on });
    const { listeners: all } = await cdp.send("DOMDebugger.getEventListeners", {
      objectId: result.objectId,
    });
    return all.filter((listener) => listener.type === type).length;
  } finally {
    await cdp.detach();
  }
}

/** Every listener a page change could leave behind, by where it is. */
async function leftBehind(page) {
  return {
    "Escape on the document (the menu's)": await listeners(
      page,
      "document",
      "keydown",
    ),
    "hashchange on the window (the sign-up's)": await listeners(
      page,
      "window",
      "hashchange",
    ),
  };
}

/** On through the bar, the router taking the visitor there. */
async function goBy(page, name, path) {
  await page.locator(".ch-bar").getByRole("link", { name }).click();
  await expect(page).toHaveURL((url) => url.pathname === path);
  await arrived(page, ".ch-page");
}

test("a page change leaves no listeners of the page before behind", async ({
  page,
}) => {
  await page.goto("/bar");
  await arrived(page);
  const first = await leftBehind(page);

  for (let lap = 0; lap < 3; lap += 1) {
    await goBy(page, /Food/, "/kitchen");
    await goBy(page, /Drinks/, "/bar");
  }

  expect(await leftBehind(page)).toEqual(first);
});

test.describe("after a Back that loads the page again", () => {
  test.use({ viewport: PHONE });

  test("the next page is a new visit: the play form puts the cursor in its first box", async ({
    page,
  }) => {
    await page.goto("/bar");
    await page.goto("/kitchen");
    await page.goBack();
    await expect(page).toHaveURL(/\/bar$/);
    // A full load, not the back-forward cache: the page says how it came
    expect(
      await page.evaluate(
        () => performance.getEntriesByType("navigation")[0]?.type,
      ),
    ).toBe("back_forward");
    await arrived(page);

    // On through the foot to Bookings' play half, then its form, by the router
    await page
      .locator(".ch-footer")
      .getByRole("link", { name: "Play here" })
      .click();
    await expect(page).toHaveURL(/\/bookings#play$/);
    await arrived(page);
    await page
      .locator("#play")
      .getByRole("link", { name: "Apply to play" })
      .click();
    await expect(page).toHaveURL(/\/contact\/play$/);
    await arrived(page);

    // Its first box is up on screen with the cursor in it, as on any visit
    const first = page.locator("[data-focus-on-arrival] input").first();
    await expect(first).toBeFocused();
    await expect(first).toBeInViewport();
    // And it came in with its entrance, not painted as a restore
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("navigation-restore"),
      ),
    ).toBe(false);
  });
});
