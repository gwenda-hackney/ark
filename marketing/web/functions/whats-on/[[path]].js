import { renderEventPage } from "../_lib/event-pages.js";

/** Series, night and ticket pages, rendered on request (#25). */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const response = await renderEventPage(env, url.pathname, async (path) =>
    (await env.ASSETS.fetch(new URL(path, request.url))).text(),
  );
  // One address per page: the canonical ends in a slash, so send the bare one there.
  if (response?.ok && !url.pathname.endsWith("/")) {
    return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  }
  return response || context.next();
}
