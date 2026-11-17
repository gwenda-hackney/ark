import { parseCookies } from "../functions/_lib/site-auth.js";
import { londonToday, pinSiteDay } from "../src/lib/london-day.js";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const COOKIE = "site-day";

/**
 * `thu` or `2026-11-19`: the next Thursday from today (today if it is one),
 * or that date; anything else is today again ("").
 */
export function askedDay(value, today = londonToday(new Date())) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const wanted = WEEK.indexOf(raw.slice(0, 3));
  if (wanted < 0) return "";
  const date = new Date(`${today}T12:00:00Z`);
  const ahead = (wanted - ((date.getUTCDay() + 6) % 7) + 7) % 7;
  date.setUTCDate(date.getUTCDate() + ahead);
  return date.toISOString().slice(0, 10);
}

/**
 * Vite dev plugin (#306): see the site as it will be on another day.
 * `?day=mon` pins the next Monday (or `?day=2026-11-23`) and keeps it in a
 * cookie as you click around; `?day=` goes back to today. It runs at the
 * Node HTTP layer, as the dev gate does: Astro's static pages can't read a
 * query or a cookie. Only `astro dev`: a build is made on the day it shows.
 */
export function devSiteDay() {
  return {
    name: "gwenda-dev-site-day",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        const asked = url.searchParams.get("day");
        let day = parseCookies(req.headers.cookie || "")[COOKIE] || "";
        if (asked !== null) {
          day = askedDay(asked);
          res.setHeader(
            "Set-Cookie",
            day
              ? `${COOKIE}=${day}; Path=/; SameSite=Lax`
              : `${COOKIE}=; Path=/; Max-Age=0`,
          );
        }
        pinSiteDay(day);
        next();
      });
    },
  };
}
