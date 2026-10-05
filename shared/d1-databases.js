/**
 * The D1 databases (#127): one per role in each Cloudflare account. Ids are
 * written by `npm run setup:d1` (#190); empty until then. Apps reach their
 * own account's databases through bindings; this table is for code without a
 * binding (scripts, the website build in CI, astro dev), via ./d1-env.js.
 */

/** Role → binding name in wrangler configs. */
export const D1_BINDINGS = {
  ops: "OPS_DB",
  website: "WEBSITE_DB",
  config: "CONFIG_DB",
};

/** Environment → role → { name, id }. */
export const D1_DATABASES = {
  production: {
    ops: { name: "gwenda-ops", id: "" },
    website: { name: "gwenda-website", id: "" },
    config: { name: "gwenda-config", id: "" },
  },
  dev: {
    ops: { name: "gwenda-ops", id: "" },
    website: { name: "gwenda-website", id: "" },
    config: { name: "gwenda-config", id: "" },
  },
};

export const D1_ROLES = Object.keys(D1_BINDINGS);
