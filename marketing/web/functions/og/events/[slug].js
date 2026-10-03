import { eventOgImage } from "../../_lib/event-pages.js";

/** `/og/events/<slug>.jpg`: a night's share image. */
export async function onRequestGet(context) {
  const slug = String(context.params?.slug || "").replace(/\.jpg$/, "");
  return eventOgImage(context.env, slug);
}
