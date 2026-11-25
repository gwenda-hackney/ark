/**
 * What's on → Schedule as a calendar: it opens on this month with today in
 * view, however far down the month today is, and its days show the page
 * behind them from the start (they painted the page's fixed glow themselves,
 * which the browser drew green inside the scroll box until the first scroll).
 */
import { expect, test } from "@playwright/test";
import { fakeApi } from "./fake-api";

test.beforeEach(async ({ page }) => {
	// 25 November 2026: a Wednesday in the month's fifth row.
	await page.clock.install({ time: new Date("2026-11-25T12:00:00Z") });
	await fakeApi(page, { email: { id: 1, sections: [] } });
	await page.setViewportSize({ width: 1280, height: 700 });
});

test("the Schedule opens on this week's calendar the first time", async ({ page }) => {
	await page.goto("/events/schedule");
	await expect(page.getByRole("heading", { name: "23 – 29 November 2026" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("gridcell")).toHaveCount(7);
});

test("the month calendar opens with today in view", async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("ops.events.calendarSpan", "month"));
	await page.goto("/events/schedule");
	const today = page.getByRole("gridcell", { name: "2026-11-25" });
	await expect(today).toBeVisible();
	await expect(today).toBeInViewport({ ratio: 0.9 });
});

test("its days don't paint a glow of their own: the page shows through from the start", async ({ page }) => {
	await page.goto("/events/schedule");
	const day = page.getByRole("gridcell", { name: "2026-11-24" });
	await expect(day).toBeVisible();
	const attachment = await day.evaluate((el) => getComputedStyle(el).backgroundAttachment);
	expect(attachment.split(",").map((part) => part.trim())).not.toContain("fixed");
});

test("Week shows this week, Monday to Sunday; the arrows move a week; Today comes back; Month is remembered", async ({ page }) => {
	await page.goto("/events/schedule");
	await expect(page.getByRole("heading", { name: "23 – 29 November 2026" })).toBeVisible();
	await expect(page.getByRole("gridcell")).toHaveCount(7);
	await expect(page.getByRole("gridcell", { name: "2026-11-25" })).toBeInViewport();

	await page.getByRole("button", { name: "Next week" }).click();
	await expect(page.getByRole("heading", { name: "30 November – 6 December 2026" })).toBeVisible();
	await page.getByRole("button", { name: "Today" }).click();
	await expect(page.getByRole("heading", { name: "23 – 29 November 2026" })).toBeVisible();

	await page.getByRole("tab", { name: "Month" }).click();
	await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
});
