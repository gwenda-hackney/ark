import { expect, test } from "@playwright/test";
import { PHONE, arrived } from "./support.js";

/**
 * The food page's menus (#306), whatever is on today: each pop-up
 * kitchen's section with its name, the week line when two or more share
 * the week, and a link for every menu and kitchen that lands on it from a
 * new tab. Which menus run on which day is lib/menus.js's, unit-tested
 * there; this is the page those links and sections make.
 */

/** Every id the page's own menu links lead to: the week line's and the jump row's. */
async function menuLinks(page) {
  return page
    .locator(".ch-week a, nav.ch-jump[aria-label='Menus'] a")
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute("href").slice(1)),
    );
}

test.describe("/kitchen's menus", () => {
  test("each kitchen's section has its name, and the week line one link each", async ({
    page,
  }) => {
    await page.goto("/kitchen");
    await arrived(page);
    const kitchens = page.locator(".ch-kitchen");
    const names = page.locator(".ch-kitchen-name");
    test.skip(
      !(await names.count()),
      "no pop-up kitchen is booked in this data",
    );
    for (const name of await names.all()) {
      await expect(name).not.toBeEmpty();
    }
    const week = page.locator(".ch-week a");
    if (await week.count()) {
      await expect(week).toHaveCount(await names.count());
    }
    // One section per kitchen, and no two links share an id
    expect(await kitchens.count()).toBeGreaterThanOrEqual(await names.count());
    const ids = await page
      .locator(".ch-kitchen[id], .ch-kitchen [id]")
      .evaluateAll((all) => all.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every menu's link lands on it from a new tab", async ({ browser }) => {
    const first = await browser.newPage();
    await first.goto("/kitchen");
    await arrived(first);
    const anchors = await menuLinks(first);
    await first.close();
    test.skip(!anchors.length, "only one menu on the food page today");
    for (const anchor of anchors) {
      const page = await browser.newPage({ viewport: PHONE });
      await page.goto(`/kitchen#${anchor}`);
      await arrived(page);
      await expect(page.locator(`#${anchor}`)).toBeInViewport();
      await page.close();
    }
  });

  test("a link from the week line or the jump row lands on its menu", async ({
    page,
  }) => {
    await page.goto("/kitchen");
    await arrived(page);
    const link = page
      .locator(".ch-week a, nav.ch-jump[aria-label='Menus'] a")
      .last();
    test.skip(!(await link.count()), "only one menu on the food page today");
    const anchor = (await link.getAttribute("href")).slice(1);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`#${anchor}$`));
    await expect(page.locator(`#${anchor}`)).toBeInViewport();
  });
});
