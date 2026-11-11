import { expect, test } from "@playwright/test";
import { arrived, settle } from "./support.js";

/**
 * Skip to content, at the top of every page, and the record at the foot
 * (Back to top) jump to the start of the page, with the keyboard there too
 * (#240). The jump is a step Back undoes, the same on home as on any other
 * page: Back after it stays on the page, where the visitor was, and never
 * leaves the site.
 */

const ways = [
  {
    name: "Skip to content",
    async use(page) {
      await page.locator(".ch-skip").focus();
      await page.keyboard.press("Enter");
    },
  },
  {
    name: "the record at the foot",
    async use(page) {
      await page.locator(".ch-footer-top").click();
    },
  },
];

for (const path of ["/", "/bar"]) {
  for (const way of ways) {
    test(`${way.name} on ${path}, then Back, stays on the page`, async ({
      page,
    }) => {
      await page.goto(path);
      await arrived(page);

      await way.use(page);
      await expect(page.locator("#main")).toBeFocused();
      await expect(page).toHaveURL((url) => url.hash === "#main");
      await settle(page);

      await page.goBack();
      await expect(page).toHaveURL(
        (url) => url.pathname === path && url.hash === "",
      );
      await arrived(page);
    });
  }
}
