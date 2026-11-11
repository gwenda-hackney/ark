import { expect, test } from "@playwright/test";
import { PHONE, arrived, settle } from "./support.js";

/**
 * The phone's navigation (#240): the menu button opens a panel down the left
 * over a scrim; the dock along the foot holds What's on and Book a table.
 */

test.use({ viewport: PHONE });

const button = (page) => page.locator("#ch-chart-btn");

/** Where the keyboard is: the menu (its button or its panel), or elsewhere. */
function focusIn(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "nothing";
    if (active.id === "ch-chart-btn") return "the button";
    if (document.getElementById("ch-chart")?.contains(active)) {
      return "the panel";
    }
    return `outside: ${active.outerHTML.slice(0, 80)}`;
  });
}

test.describe("the open menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bar");
    await arrived(page);
    await button(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".ch-page")).toHaveAttribute(
      "data-chart",
      "open",
    );
  });

  test("keeps Tab in the menu, both ways, until it closes", async ({
    page,
  }) => {
    const forward = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      forward.push(await focusIn(page));
    }
    const back = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Shift+Tab");
      back.push(await focusIn(page));
    }
    // Past either end the keyboard may go to the browser's own controls
    // ("nothing" on the page), never to the page behind the scrim
    for (const where of [...forward, ...back]) {
      expect(["the button", "the panel", "nothing"]).toContain(where);
    }
    expect(forward).toContain("the button");
    expect(back).toContain("the button");
  });

  test("Escape closes it, hands the keyboard back to the button, and wakes the page", async ({
    page,
  }) => {
    await page.keyboard.press("Tab");
    expect(await focusIn(page)).toBe("the panel");
    await page.keyboard.press("Escape");
    await expect(page.locator(".ch-page")).toHaveAttribute(
      "data-chart",
      "closed",
    );
    await expect(button(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.locator(".ch-dock").getByRole("link", { name: /What.s on/ }),
    ).toBeFocused();
  });

  test("closes when the screen grows to the bar's width, and leaves the page usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".ch-page")).toHaveAttribute(
      "data-chart",
      "closed",
    );
    await page.locator(".ch-bar").getByRole("link", { name: /Food/ }).click();
    await expect(page).toHaveURL(/\/kitchen$/);
  });
});

test("the dock's What's on goes down home, not off it", async ({ page }) => {
  await page.goto("/");
  await arrived(page, ".ch-home #hero");
  await page
    .locator(".ch-dock")
    .getByRole("link", { name: /What.s on/ })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page).toHaveURL((url) => url.hash === "#whats-on");
  await settle(page);
  await expect(page.locator("#whats-on")).toBeInViewport();
});
