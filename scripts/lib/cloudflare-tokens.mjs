/** Cloudflare API tokens in local .env. CI still uses GitHub secret CLOUDFLARE_API_TOKEN. */

/** Local DEV token: Pages, Wrangler, and Access setup. */
export function resolveCloudflareDevToken(env = process.env) {
  return (
    env.CLOUDFLARE_DEV_API_TOKEN?.trim() ||
    env.CLOUDFLARE_API_TOKEN?.trim() ||
    ""
  );
}
