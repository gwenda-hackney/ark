import { expect, test } from "@playwright/test";

/**
 * Home's logo (#240) is the first thing a visitor sees, so on a phone it
 * comes first: asked for at once and at high priority, a phone-sized file,
 * with nothing preloaded ahead of it, and SOCIAL under it from its own small
 * cut of Rubik Distressed rather than the 197 KB full file. On a slow phone
 * connection that took the logo from 5.5s to 2.2s before launch.
 *
 * Run it against a build (E2E_BASE_URL) to check what ships;
 * src/lib/home-first-paint.test.js keeps the same choices in the unit tests.
 */
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test("home asks for its logo first, at a phone's size", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/", { waitUntil: "load" });

  // Anything preloaded is fetched ahead of the logo, or beside it
  await expect(page.locator('head link[rel="preload"]')).toHaveCount(0);

  const logo = page.locator("img.ch-hero-logo");
  await expect(logo).toHaveAttribute("fetchpriority", "high");
  await expect(logo).toHaveAttribute("loading", "eager");
  const { file, kb } = await logo.evaluate(async (img) => {
    await img.decode();
    const entry = performance.getEntriesByName(img.currentSrc)[0];
    return { file: img.currentSrc, kb: (entry?.encodedBodySize ?? 0) / 1024 };
  });
  // 82vw of a 390px phone at 3x: the largest file, and still light
  expect(file).toMatch(/bottle-hero-864\./);
  expect(kb).toBeGreaterThan(0);
  expect(kb).toBeLessThan(80);

  // The logo is asked for before any font
  const logoAt = requests.findIndex((url) => url.includes("bottle-hero-"));
  const fontAt = requests.findIndex((url) => /\.woff2?(\?|$)/.test(url));
  expect(logoAt).toBeGreaterThan(-1);
  if (fontAt > -1) expect(logoAt).toBeLessThan(fontAt);

  // Never the old look's faces, nor Rubik Distressed's full file
  expect(
    requests.filter((url) =>
      /cormorant|lora-latin|rubik-distressed-latin/.test(url),
    ),
  ).toEqual([]);
});
