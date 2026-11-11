import { expect, test } from "@playwright/test";

/**
 * Home's hero comes in piece by piece (#240): the logo first, then SOCIAL and
 * the line, then the five numbered links one after another, all done within
 * a second, and every piece ends fully shown where it belongs. It plays on a
 * fresh load and on coming to home from another page; never with reduced
 * motion, and never on Back, where home shows as it was left.
 *
 * The tests stop the entrance's clock at chosen moments and look at what a
 * visitor would see then, so a busy machine's dropped frames don't matter.
 */

/** The pieces, in the order they come in. */
const PIECES = [
  ["logo", ".ch-hero-logo"],
  ["SOCIAL", ".ch-hero-social"],
  ["the line", ".ch-hero-line"],
  ...[1, 2, 3, 4, 5].map((n) => [
    `link ${n}`,
    `.ch-hero-nav li:nth-child(${n})`,
  ]),
];

/** By when the entrance is over, in ms. */
const DONE_BY = 1000;

/**
 * What the visitor sees of each piece with the entrance's clock at `at` ms
 * (or left running when `at` is null): how much of it shows (its opacity,
 * times its parents' up to the hero) and how far it sits from its place
 * (its middle, or its width).
 */
function look(page, at = null) {
  return page.evaluate(
    ({ pieces, at }) => {
      const hero = document.getElementById("hero");
      if (!hero) throw new Error("no hero");
      const animations = hero.getAnimations({ subtree: true });
      const shown = (el) => {
        let o = 1;
        for (let n = el; n && n !== hero.parentElement; n = n.parentElement) {
          o *= Number(getComputedStyle(n).opacity);
        }
        return o;
      };
      const where = () =>
        pieces.map(([, sel]) => {
          const el = hero.querySelector(sel);
          if (!el) throw new Error(`no ${sel}`);
          const r = el.getBoundingClientRect();
          return {
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            w: r.width,
            shown: shown(el),
          };
        });
      if (at !== null) {
        for (const a of animations) {
          a.pause();
          a.currentTime = at;
        }
      }
      const now = where();
      // Where each piece belongs: with the entrance over
      for (const a of animations) a.finish();
      const end = where();
      return pieces.map(([name], i) => ({
        name,
        shown: Math.round(now[i].shown * 1000) / 1000,
        off:
          Math.round(
            Math.max(
              Math.abs(now[i].x - end[i].x),
              Math.abs(now[i].y - end[i].y),
              Math.abs(now[i].w - end[i].w),
            ) * 10,
          ) / 10,
        endShown: end[i].shown,
      }));
    },
    { pieces: PIECES, at },
  );
}

/**
 * When each piece is half shown, in ms from the start, stepping the
 * entrance's clock through its first `until` ms (null if it never is).
 */
function halfShownAt(page, until = 1200) {
  return page.evaluate(
    ({ pieces, until }) => {
      const hero = document.getElementById("hero");
      if (!hero) throw new Error("no hero");
      const animations = hero.getAnimations({ subtree: true });
      const shown = (el) => {
        let o = 1;
        for (let n = el; n && n !== hero.parentElement; n = n.parentElement) {
          o *= Number(getComputedStyle(n).opacity);
        }
        return o;
      };
      const els = pieces.map(([, sel]) => hero.querySelector(sel));
      /** @type {(number | null)[]} */
      const at = els.map(() => null);
      for (let t = 0; t <= until; t += 10) {
        for (const a of animations) {
          a.pause();
          a.currentTime = t;
        }
        els.forEach((el, i) => {
          if (at[i] === null && el && shown(el) >= 0.5) at[i] = t;
        });
      }
      for (const a of animations) a.finish();
      return Object.fromEntries(pieces.map(([name], i) => [name, at[i]]));
    },
    { pieces: PIECES, until },
  );
}

/**
 * The entrance's animations on the hero: how many, and when they end. Only
 * its own keyframes count: a link's hover fade (the pointer is still where
 * the last click left it) is not an entrance.
 */
function entrance(page) {
  return page.evaluate(() => {
    const hero = document.getElementById("hero");
    const animations = (hero?.getAnimations({ subtree: true }) ?? []).filter(
      (a) => a.animationName?.startsWith("ch-hero-"),
    );
    return {
      count: animations.length,
      which: animations.map(
        (a) =>
          `${a.animationName} on ${a.effect?.target?.className || a.effect?.target?.tagName}`,
      ),
      running: animations.filter((a) => a.playState === "running").length,
      end: Math.max(
        0,
        ...animations.map((a) => Number(a.effect?.getComputedTiming().endTime)),
      ),
    };
  });
}

function expectAllShownInPlace(seen, when) {
  for (const piece of seen) {
    expect(piece.shown, `${piece.name} fully shown ${when}`).toBe(1);
    expect(piece.off, `${piece.name} in its place ${when}`).toBeLessThan(0.5);
  }
}

const byName = (seen) => Object.fromEntries(seen.map((p) => [p.name, p]));

/** Fresh load of home, stopped as soon as the page is there. */
async function loadHome(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#hero .ch-hero-nav li")).toHaveCount(5);
}

test.describe("home's hero entrance", () => {
  test("comes in piece by piece: the logo, then SOCIAL and the line, then the links", async ({
    page,
  }) => {
    await loadHome(page);

    // At the start the links aren't showing yet
    const atStart = await look(page, 0);
    const start = byName(atStart);
    for (const n of [1, 2, 3, 4, 5]) {
      expect(start[`link ${n}`].shown, `link ${n} at the start`).toBe(0);
    }

    // Then each in its turn: the logo, SOCIAL and the line, the links one
    // after another
    const half = await halfShownAt(page);
    const order = PIECES.map(([name]) => name);
    for (const name of order) {
      expect(half[name], `${name} shows`).not.toBeNull();
    }
    expect(half.logo).toBeLessThan(half.SOCIAL);
    expect(half.SOCIAL).toBeLessThanOrEqual(half["the line"]);
    expect(half["the line"]).toBeLessThan(half["link 1"]);
    for (const n of [1, 2, 3, 4]) {
      expect(half[`link ${n}`], `link ${n} before link ${n + 1}`).toBeLessThan(
        half[`link ${n + 1}`],
      );
    }

    // Small movements only: nothing starts more than 16px from its place
    for (const piece of atStart) {
      expect(piece.off, `${piece.name} starts near its place`).toBeLessThan(17);
    }
  });

  test("is over within a second, every piece fully shown and in place", async ({
    page,
  }) => {
    await loadHome(page);
    const { count, end } = await entrance(page);
    expect(count, "the hero has an entrance").toBeGreaterThanOrEqual(
      PIECES.length,
    );
    expect(end, "the entrance's last piece is in by then").toBeLessThanOrEqual(
      DONE_BY,
    );

    // Left to run, it ends that way
    await expect.poll(async () => (await entrance(page)).running).toBe(0);
    expectAllShownInPlace(await look(page), "once it's over");
    // And it's that way by DONE_BY
    expectAllShownInPlace(await look(page, DONE_BY), `at ${DONE_BY}ms`);
  });

  test("plays when coming to home from another page", async ({ page }) => {
    await page.goto("/contact");
    await page.locator(".ch-bar-home").click();
    await expect(page.locator(".ch-home #hero")).toBeAttached();
    const { count } = await entrance(page);
    expect(count, "the hero comes in by its own entrance").toBeGreaterThan(
      PIECES.length - 1,
    );
    // The page's own rise between pages leaves the hero to it, so nothing
    // moves twice
    expect(
      await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".ch-hero-content"))
            .viewTransitionName,
      ),
    ).not.toBe("none");
    await expect.poll(async () => (await entrance(page)).running).toBe(0);
    expectAllShownInPlace(await look(page), "once it's over");
  });

  test("doesn't play on Back: home shows as it was", async ({ page }) => {
    await page.goto("/");
    await expect.poll(async () => (await entrance(page)).running).toBe(0);
    await page
      .locator("#hero")
      .getByRole("link", { name: /Contact/ })
      .click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.locator(".ch-page:not(.ch-home)")).toBeAttached();

    await page.goBack();
    await expect(page.locator(".ch-home #hero")).toBeAttached();
    const onBack = await entrance(page);
    expect(onBack.count, `no entrance on Back: ${onBack.which}`).toBe(0);
    expectAllShownInPlace(await look(page), "on Back");
  });

  test("doesn't play on Back after a full page load either", async ({
    page,
  }) => {
    await page.goto("/");
    await expect.poll(async () => (await entrance(page)).running).toBe(0);
    // Somewhere the router doesn't take
    await page.goto("/contact");
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".ch-home #hero")).toBeAttached();
    expect((await entrance(page)).running, "no entrance on Back").toBe(0);
    expectAllShownInPlace(await look(page), "on Back");
  });
});

test.describe("home's hero, with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows at once, every piece in place", async ({ page }) => {
    await loadHome(page);
    expect((await entrance(page)).count, "no entrance").toBe(0);
    expectAllShownInPlace(await look(page), "at once");
  });
});
