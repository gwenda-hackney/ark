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
    ops: { name: "gwenda-ops", id: "2b070281-670d-412b-9da3-da906325ea74" },
    website: {
      name: "gwenda-website",
      id: "e5ac0a26-2c6c-4182-9230-073ea8f331b1",
    },
    config: {
      name: "gwenda-config",
      id: "af5ceb9e-edfb-40f1-a92c-54a7dbb3cd7b",
    },
  },
  dev: {
    ops: { name: "gwenda-ops", id: "d3d5053d-45b7-48ba-b2f4-af5af109fbb3" },
    website: {
      name: "gwenda-website",
      id: "868113b6-d7bd-4e34-8ee9-5bf5438c50a1",
    },
    config: {
      name: "gwenda-config",
      id: "9123334a-25d7-4238-b478-dd5bd2499658",
    },
  },
};

export const D1_ROLES = Object.keys(D1_BINDINGS);
