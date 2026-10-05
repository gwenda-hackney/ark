/**
 * gwenda-instagram-fake: the fake Instagram Graph API as a dev-only Worker
 * (#26). Dev ops posts here (INSTAGRAM_GRAPH_URL); posts live in KV, and
 * "View on Instagram" opens this Worker's preview page. Never deploy it to the
 * production account. Setup: docs/instagram.md.
 */
import { createFakeInstagram } from "./fake-instagram.js";

export default {
  /** @param {Request} request @param {Record<string, any>} env */
  async fetch(request, env) {
    return createFakeInstagram({
      token: String(env.INSTAGRAM_ACCESS_TOKEN || "").trim(),
      userId: String(env.INSTAGRAM_USER_ID || "").trim(),
      username: String(env.INSTAGRAM_USERNAME || "gwenda_dev_test").trim(),
      store: env.POSTS,
    }).fetch(request);
  },
};
