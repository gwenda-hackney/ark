import { expect, test } from "@playwright/test";
import { arrived } from "./support.js";

/**
 * The list's sign-up (#240), in the foot of every page: once it's sent, the
 * thanks takes the form's place, and the keyboard and a screen reader go
 * with it.
 */

test.beforeEach(async ({ page }) => {
  // Never the real list: the server's two answers, stubbed
  await page.route("**/api/subscribe", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ json: { ok: true } })
      : route.fulfill({ json: { csrfToken: "test", secret: "test" } }),
  );
});

test("sent, the thanks takes the keyboard and says You're in", async ({
  page,
}) => {
  await page.goto("/bar");
  await arrived(page);
  const foot = page.locator(".ch-footer .signup");
  await foot.getByLabel("Email address").fill("someone@example.com");
  await foot.getByRole("checkbox").check();
  await foot.getByRole("button", { name: /./ }).click();

  const thanks = foot.locator(".signup-confirm");
  await expect(thanks).toBeVisible();
  await expect(thanks).toBeFocused();
  await expect(thanks).toContainText("You're in");
});
