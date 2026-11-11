import { expect } from "@playwright/test";

/** Frames the page has to stay put to count as still, on a busy machine too. */
const STILL_FRAMES = 12;

/** Wait until the page has stopped moving. */
export async function settle(page) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const since = performance.now();
        let last = scrollY;
        let still = 0;
        const tick = () => {
          still = scrollY === last ? still + 1 : 0;
          last = scrollY;
          if (still >= frames && performance.now() - since > 400) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    STILL_FRAMES,
  );
}

/**
 * The page change is over: the new page is in (`selector` is on it), its
 * move between pages has finished, and the page has come to rest.
 */
export async function arrived(page, selector = ".ch-page") {
  await expect(page.locator(selector).first()).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.matches(":active-view-transition"),
      ),
    )
    .toBe(false);
  await settle(page);
}

/** A phone: the menu button and its panel, and the dock along the foot. */
export const PHONE = { width: 390, height: 844 };
