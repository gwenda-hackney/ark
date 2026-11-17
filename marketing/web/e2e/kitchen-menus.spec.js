import { expect, test } from "@playwright/test";
import { PHONE, arrived } from "./support.js";

/**
 * The food page with two pop-up kitchens in one week (#306): the week line,
 * each kitchen's section in week order with today's marked, and a link for
 * every menu that lands on it from a new tab.
 *
 * It needs the sample data: a dev server started with
 * `SITE_FIXTURE=fixtures/two-popups.mjs` (Chez Pickle Wed–Sun, a made-up
 * Monday kitchen), and `?day=` to pin the day (scripts/dev-site-day.js).
 * Run it with E2E_BASE_URL pointing at that server.
 */

async function open(page, path) {
  await page.goto(path);
  await arrived(page);
  test.skip(
    !(await page.getByText("Monday Dumplings (sample)").count()),
    "needs the two-popups sample data (SITE_FIXTURE=fixtures/two-popups.mjs)",
  );
}

const week = (page) => page.locator(".ch-week");
const kitchens = (page) => page.locator(".ch-kitchen");

test.describe("two pop-up kitchens on /kitchen", () => {
  test("a week line, then each kitchen in week order, the same every day", async ({
    page,
  }) => {
    for (const day of ["mon", "thu"]) {
      await open(page, `/kitchen?day=${day}`);
      await expect(week(page)).toHaveText(
        "Mon: Monday Dumplings (sample) · Wed–Sun: Chez Pickle",
      );
      await expect(kitchens(page).locator(".ch-kitchen-name a")).toHaveText([
        "Monday Dumplings (sample)",
        "Chez Pickle",
      ]);
    }
  });

  test("marks the kitchen cooking today", async ({ page }) => {
    await open(page, "/kitchen?day=thu");
    await expect(page.locator(".ch-kitchen-name .ch-today")).toHaveCount(1);
    await expect(kitchens(page).nth(1).locator(".ch-today")).toHaveText(
      "Today",
    );
    await open(page, "/kitchen?day=mon");
    await expect(kitchens(page).nth(0).locator(".ch-today")).toHaveText(
      "Today",
    );
  });

  test("the week line jumps to each kitchen's menu", async ({ page }) => {
    await open(page, "/kitchen?day=thu");
    await week(page).getByRole("link", { name: "Chez Pickle" }).click();
    await expect(page).toHaveURL(/#chez-pickle$/);
    await expect(page.locator("#chez-pickle")).toBeInViewport();
  });

  test("every menu's link lands on it from a new tab", async ({ browser }) => {
    for (const [anchor, name] of [
      ["chez-pickle", "Chez Pickle"],
      ["monday-dumplings", "Monday Dumplings (sample)"],
    ]) {
      const page = await browser.newPage({ viewport: PHONE });
      await open(page, `/kitchen?day=thu#${anchor}`);
      const target = page.locator(`#${anchor}`);
      await expect(target).toBeInViewport();
      await expect(target.locator(".ch-kitchen-name")).toContainText(name);
      await page.close();
    }
  });
});

test.describe("home's Food board with two kitchens", () => {
  test("leads with whoever cooks that day, the other under Also", async ({
    page,
  }) => {
    const board = page.locator(".ch-menu-side--food");
    await open(page, "/?day=mon");
    await expect(board.locator(".ch-menu-kitchen-line")).toHaveText(
      "In the kitchen: Monday Dumplings (sample)",
    );
    await expect(board.locator(".ch-menu-also")).toHaveText(
      "Also: Wed–Sun, Chez Pickle →",
    );
    await open(page, "/?day=thu");
    await expect(board.locator(".ch-menu-kitchen-line")).toHaveText(
      "In the kitchen: Chez Pickle",
    );
    await expect(board.locator(".ch-menu-also")).toHaveText(
      "Also: Mon, Monday Dumplings (sample) →",
    );
    await open(page, "/?day=tue");
    await expect(board.locator(".ch-menu-kitchen-line")).toHaveText(
      "Wednesday: Chez Pickle",
    );
  });
});
