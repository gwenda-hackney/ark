/**
 * Sample data for a local dev server (#306): `SITE_FIXTURE=<file>` makes
 * the site read Sanity documents from that file instead of a dataset, with
 * the site's own GROQ queries run on them (groq-js, as ops' tests do). So a
 * page can be seen with a made-up second pop-up, or any other sample, with
 * no Sanity token and nothing written anywhere.
 *
 * The file is a module whose default export is the documents, or a
 * function of today (YYYY-MM-DD at the bar) that returns them, so nights
 * and dates can sit around whatever day it is. Only `fetch` is offered:
 * the site reads, never writes. Sample files live in fixtures/.
 */
import { resolve } from "node:path";
import { londonToday } from "../london-day.js";

/** @param {string} file the fixture module, from the web package's folder */
export function fixtureClient(file) {
  const url = resolve(process.cwd(), file);
  return {
    async fetch(query, params = {}) {
      const [{ parse, evaluate }, loaded] = await Promise.all([
        import("groq-js"),
        // Read once per server: restart it after editing the file
        import(/* @vite-ignore */ url),
      ]);
      const docs =
        typeof loaded.default === "function"
          ? loaded.default(londonToday(new Date()))
          : loaded.default;
      const result = await evaluate(parse(query, { params }), {
        dataset: docs,
        params,
      });
      return result.get();
    },
  };
}
