# Preview sites: Cloudflare Access

The preview sites show unpublished drafts. Cloudflare Access sits in front of them: you type your Gwenda email, Cloudflare emails you a code, and you're in for a month. Nobody needs the site password.

| Covered by Access | Open to everyone |
|---|---|
| `preview.gwenda-blue.pages.dev` (production drafts) | `gwenda.co.uk` (the live site) |
| `preview.gwenda-web-dev.pages.dev` (dev drafts) | `gwenda-web-dev.pages.dev` (the live dev site) |
| PR previews, `<branch>.gwenda-web-dev.pages.dev` | |

Access protects a Pages project's preview deployments, which are exactly the sites above. Anyone with an `@gwenda.co.uk` address can sign in.

**The password stays as a backstop.** When Access has signed someone in, the website checks Access's signature (`verifyAccessAssertion` in `marketing/web/functions/_lib/site-auth.js`) and skips its own password. If Access is ever switched off or misconfigured, the password page comes back. Search and link-preview bots can't get through Access, so a preview link pasted into WhatsApp shows no preview card. That's fine for drafts.

**CI** smoke tests get through with an Access service token (`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`), sent by `marketing/web/scripts/ci/smoke-test.mjs`.

## Setting it up

Do this once in each Cloudflare account: **gwenda-dev** first (project `gwenda-web-dev`), then production (project `gwenda-blue`). Use the dev account to check everything works.

1. **Turn on Zero Trust.** In the Cloudflare dashboard, pick the account and open **Zero Trust**. The first time, it asks for a team name: use `gwenda-dev` for dev and `gwenda` for production. Choose the **Free** plan. It may ask for a card even though the plan is free.
2. **Protect the previews.** Go to **Workers & Pages**, open the project, then **Settings → General → Access policy**, and press **Enable access policy**. This creates an Access application for the project's preview deployments.
3. **Let Gwenda in.** Go to **Zero Trust → Access → Applications**, open the new application, and edit its policy:
   - Include: **Emails ending in** `@gwenda.co.uk`.
   - Remove the single email Cloudflare added by default, if it's not needed.
   - Under the application's settings, set **Session duration** to **1 month**.

   One-time PIN, a code sent by email, is on by default. To offer "Sign in with Google" as well, add Google under **Settings → Authentication**.
4. **Give CI a key.** Go to **Zero Trust → Access → Service credentials → Service tokens** and create a token called `github-smoke-tests` that never expires. Copy the **Client ID** and **Client Secret** now: the secret is only shown once. Back on the application, add a second policy:
   - Action: **Service Auth**.
   - Include: **Service Token** `github-smoke-tests`.
5. **Store the key.** Put the two values in `.env`, using `__DEV` for the dev account and `__PRODUCTION` for production:

   ```bash
   CF_ACCESS_CLIENT_ID__DEV=...
   CF_ACCESS_CLIENT_SECRET__DEV=...
   ```

   Then run `npm run secrets:import-env -- --apply`. It stores both in Secrets Manager and takes them out of `.env`.
6. **Tell the website about Access.** From the application's **Overview**, copy the **Application Audience (AUD) Tag**. Neither value is a secret. Set both in the project's wrangler file under `[env.preview.vars]`: `marketing/web/wrangler.dev.toml` for dev, `marketing/web/wrangler.toml` for production.

   ```toml
   ACCESS_TEAM_DOMAIN = "https://gwenda-dev.cloudflareaccess.com"
   ACCESS_AUD = "<the AUD tag>"
   ```

   The next deploy picks them up.

## Checking it

- On your phone, open a preview link. You should see Cloudflare's sign-in, then the page, with no password page.
- The next deploy's smoke test passes on the preview.
- `gwenda-web-dev.pages.dev` and `gwenda.co.uk` still open without signing in.
