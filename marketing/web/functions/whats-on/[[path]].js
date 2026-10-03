import { renderEventPage } from "../_lib/event-pages.js";

/** Series, night and ticket pages, rendered on request (#25). */
export async function onRequestGet(context) {
  const { request, env } = context;
  const response = await renderEventPage(
    env,
    new URL(request.url).pathname,
    async (path) => (await env.ASSETS.fetch(new URL(path, request.url))).text(),
  );
  return response || context.next();
}
