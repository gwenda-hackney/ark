import type { PreviewProps } from "sanity";
import { useFormValue } from "sanity";
import { buildEventChannelUrl } from "../lib/site";

/**
 * Show the full shareable invite link as the channel's subtitle in the
 * channels list, so it can be read (and the row opened to copy) at a glance.
 * `select` passes the channel token in as `subtitle`; we swap in the URL.
 */
export function ChannelPreview(props: PreviewProps) {
  const slug = useFormValue(["slug", "current"]) as string | undefined;
  const token = typeof props.subtitle === "string" ? props.subtitle : undefined;
  const subtitle =
    slug?.trim() && token?.trim()
      ? buildEventChannelUrl(slug, token)
      : "Link ready once the event has a slug";

  return props.renderDefault({ ...props, subtitle });
}
