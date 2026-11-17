/**
 * Sample data over the real content, for a local dev server (#306):
 * `SITE_OVERLAY=<file>` reads every document from the dataset the site
 * would read anyway (dev's Sanity, drafts and all), once per server, lets
 * the file add to or change them, and runs the site's own GROQ queries on
 * the result (groq-js, as ops' tests do). So a page can be seen with a
 * made-up second pop-up kitchen next to everything that's really there,
 * and nothing is written anywhere.
 *
 * The file is a module whose default export is a function of the
 * documents and today (YYYY-MM-DD at the bar) that returns the documents
 * to use. Restart the server after editing it. Samples live in fixtures/.
 */
import { resolve } from "node:path";
import { londonToday } from "../london-day.js";

/** Everything the site reads: content and image assets, as drafts overlay them. */
const EVERYTHING = `*[!(_id in path("versions.**"))]`;

/**
 * @param {string} file the overlay module, from the web package's folder
 * @param {{ fetch: (query: string, params?: object) => Promise<any> }} base
 *   the site's own Sanity client
 */
export function overlayClient(file, base) {
  const path = resolve(process.cwd(), file);
  let dataset;
  const load = async () => {
    const [docs, overlay] = await Promise.all([
      base.fetch(EVERYTHING),
      import(/* @vite-ignore */ path),
    ]);
    return overlay.default(docs || [], londonToday(new Date()));
  };
  return {
    async fetch(query, params = {}) {
      dataset ??= load().catch((error) => {
        dataset = undefined;
        throw error;
      });
      const [{ parse, evaluate }, docs] = await Promise.all([
        import("groq-js"),
        dataset,
      ]);
      const result = await evaluate(parse(query, { params }), {
        dataset: docs,
        params,
      });
      return result.get();
    },
  };
}
