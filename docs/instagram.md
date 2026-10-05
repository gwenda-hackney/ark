# Instagram

Ops can post a series, a night or a special to the Instagram feed from the event's **Instagram** tab (#26). This page is how it's wired, how dev is kept away from the real account, and the Meta setup production needs.

## How it works

- The tab shows the image Instagram gets (the photo from Details as a 1080×1350 JPEG from the Sanity CDN, cropped to 4:5 around the editor's framing, or shown whole on the brand background), a caption to edit, **Check** and **Post**.
- **Check** has Instagram fetch and check the image and caption without posting. It creates a media container and never publishes it; Instagram drops it after 24 hours.
- **Post** creates the container, waits until Instagram has processed it, then publishes. A night must be on the website first, so the link in the caption works.
- Posts are recorded in D1 (`gwenda-ops`, table `instagram_posts`). A unique index allows one post in flight per night, so a double click can't post twice. A post left in flight by a request that stopped is finished from the container's status on the next Post: if Instagram already published it, it's recorded as sent and never published again.
- Code: `ops/site/src/instagram/server/` (domain, repository, publisher, use cases), the API in `ops/site/functions/api/events/[id]/instagram*` and `api/instagram/status.js`, the tab in `ops/site/src/events/tabs/InstagramTab.svelte`.

## Environments: only production talks to Meta

Meta has no sandbox: an app in development mode still posts for real. So dev and local never talk to Meta. They talk to our own fake Instagram (`ops/instagram-fake`).

|                                               | Production ops                                                                   | Dev ops                                       | Your machine and tests                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Graph API (`INSTAGRAM_GRAPH_URL`)             | `https://graph.facebook.com/v24.0` (the code's default; leave it unset)          | the fake Worker's address                     | `wrangler dev` of the fake, or unset for a dry run. Tests use the fake in process (`src/testing/fake-world.js`). |
| `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` | `__PRODUCTION`: the Meta system user's token, @gwendahackney's Instagram user id | `__DEV`: made-up values only the fake accepts | the same `__DEV` values                                                                                          |

Guards in `adapters/graph-publisher.js`:

- production only ever talks to `graph.facebook.com`, whatever `INSTAGRAM_GRAPH_URL` says;
- anywhere else, a `facebook.com` or `instagram.com` address is refused;
- dev with no `INSTAGRAM_GRAPH_URL` is a dry run: nothing is sent, nothing is stored, and production values are never used instead.

`GRAPH_VERSION` in `graph-publisher.js` is the Graph API version (`v24.0`). Meta supports each version for about two years; move it on when Meta's changelog says it's going.

## Before it works anywhere

Posts are stored in `gwenda-ops` through the `OPS_DB` binding (#190). Hosted ops has it, and deploys apply `db/ops/migrations` first (#191). `npm run ops:dev` applies them to its throwaway local databases before it starts. Without the binding or an Instagram address, the tab says "Instagram isn't set up in this environment yet."

## The fake Instagram (dev)

`ops/instagram-fake` is a Worker that mimics the Graph API calls ops makes, with Meta's response and error shapes. It really fetches the image and checks it as Meta would (a JPEG, between 4:5 and 1.91:1, at most 8 MB) and checks the caption (2,200 characters, 30 hashtags, 20 mentions). Published posts are kept in KV: "View on Instagram" opens a phone-style preview at `/p/<id>`, and `/` lists every post.

Fault switches, to try what happens when Instagram misbehaves:

| Switch       | What happens                                                            |
| ------------ | ----------------------------------------------------------------------- |
| `slow`       | the container needs a few checks before it's ready (ops waits)          |
| `stuck`      | the container never finishes (ops says to press Post again in a minute) |
| `error`      | the container ends in an error                                          |
| `token`      | every call fails as an expired token                                    |
| `rate-limit` | publishing fails on the daily limit                                     |

Turn one on with `[fail:<switch>]` anywhere in the caption, or point `INSTAGRAM_GRAPH_URL` at `…/fail/<switch>/v24.0` for every post. Direct calls can also use `?fail=<switch>` or an `X-Fake-Fail` header.

### Setting it up for dev (once)

1. Make the dev values and store them (they are made up; only the fake accepts them):

   ```bash
   INSTAGRAM_ACCESS_TOKEN=$(openssl rand -hex 24) npm run env:ops:push -- --profile dev INSTAGRAM_ACCESS_TOKEN
   INSTAGRAM_USER_ID=17841400000000001 npm run env:ops:push -- --profile dev INSTAGRAM_USER_ID
   npm run env:secrets:refresh
   ```

   The user id must match `INSTAGRAM_USER_ID` in `ops/instagram-fake/wrangler.toml`.

2. Deploy the fake to the **gwenda-dev** Cloudflare account. The dev Cloudflare token (`CLOUDFLARE_API_TOKEN__DEV`) needs **Workers Scripts · Edit** and **Workers KV Storage · Edit** for this; it has only Pages and Workers AI today. From the repo root:

   ```bash
   node scripts/with-env.mjs npx wrangler deploy -c ops/instagram-fake/wrangler.toml
   node scripts/with-ops-env.mjs sh -c 'printf %s "$INSTAGRAM_ACCESS_TOKEN" | npx wrangler secret put INSTAGRAM_ACCESS_TOKEN -c ops/instagram-fake/wrangler.toml'
   ```

   Never deploy it with the production token: it would sit next to the real apps and mean nothing there.

3. Point dev ops at it: in `ops/site/wrangler.dev.toml`, set `INSTAGRAM_GRAPH_URL = "https://gwenda-instagram-fake.<dev subdomain>.workers.dev/v24.0"` under `[vars]`, and merge. Dev ops picks up the `__DEV` secrets on its next deploy (`apps.yml` syncs ops secrets first).

CI doesn't deploy the fake: it changes rarely, and the Workers workflow deploys to the production account. Redeploy it by hand after changing it.

### On your machine

```bash
node scripts/with-ops-env.mjs sh -c 'npx wrangler dev -c ops/instagram-fake/wrangler.toml --port 8790 --var INSTAGRAM_ACCESS_TOKEN:"$INSTAGRAM_ACCESS_TOKEN"'
```

Then put `INSTAGRAM_GRAPH_URL=http://localhost:8790/v24.0` in your `.env` and run `npm run ops:dev`. Without it, local ops is a dry run. Both sides read the made-up `INSTAGRAM_ACCESS_TOKEN__DEV` and `INSTAGRAM_USER_ID__DEV` (`17841400000000001`, the fake's account), so push those once (dev setup step 2) before the first local run.

`ops:dev` gives posts a local `OPS_DB` with the migrations applied (in `ops/site/.wrangler/state`, gitignored), so Post, the posts list and the double-post guard all work. Delete that folder to start again with no posts.

`npm run ops:prod` (a local copy on live data) is always a dry run for Instagram: it would record posts only in its local database, so it couldn't warn about a night production already posted.

## Production: the Meta setup

Someone with admin rights on Gwenda's Meta Business portfolio does this once. It uses a **system user**, whose token doesn't expire, so nobody's personal Facebook login is involved.

1. **Check the accounts.** @gwendahackney must be an Instagram professional account (Business), linked to Gwenda's Facebook Page, and both must be in Gwenda's Business portfolio (business.facebook.com → Settings → Accounts → Instagram accounts and Pages).
2. **Create the app.** developers.facebook.com → My Apps → Create app. Choose the Business type and connect it to Gwenda's Business portfolio. Add the products **Facebook Login for Business** and **Instagram** (the Instagram API with Facebook Login). Name it so it's clearly ops, for example `gwenda-ops`.
3. **Create the system user.** Business settings → Users → System users → Add. Name it `INSTAGRAM_ACCESS_TOKEN`, like the variable that holds its token. Role: Employee (not Admin).
4. **Give it the assets.** On the system user, Assign assets:
   - the app: Develop app (or Manage app);
   - the Facebook Page: Content (create content);
   - the Instagram account @gwendahackney: Content (create content).
5. **Generate the token.** On the system user, Generate new token: pick the app, set expiry to **Never**, and tick only:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
6. **Find the Instagram user id**, the account's id in the Graph API (not the @handle). With the token in your shell, without printing it:

   ```bash
   curl -s -H "Authorization: Bearer $INSTAGRAM_ACCESS_TOKEN" \
     "https://graph.facebook.com/v24.0/me/accounts?fields=name,instagram_business_account{id,username}"
   ```

   Use the `instagram_business_account.id` next to Gwenda's Page.

7. **Store both** as production values, then sync production ops' secrets from `release`:

   ```bash
   npm run env:ops:push -- --profile production INSTAGRAM_ACCESS_TOKEN   # value from the shell or .env
   npm run env:ops:push -- --profile production INSTAGRAM_USER_ID
   gh workflow run ops-secrets.yml --ref release
   ```

   Pages keeps secrets per deployment, so redeploy production ops afterwards (Apps workflow, app `ops`, target production, from `release`). Delete any `.env` lines you used once they're pushed.

**To confirm before the first post:** whether the app needs Meta's App Review (Advanced Access) or whether Standard Access is enough. Meta's documentation says Standard Access covers accounts the app's business owns and manages, which is our case with a system user in the same portfolio, so review shouldn't be needed. If the publish call says the permission isn't granted, request Advanced Access for `instagram_content_publish` and `instagram_basic` in the app's App Review section. The app may also need to be switched to **Live** mode.

### First use in production

1. Open a night that's on the website, go to Instagram and press **Check**. It proves the token, the account, the image and the caption, and posts nothing.
2. When you're ready, press **Post**. The button and the confirm both name @gwendahackney.

### Changing the token

Generate a new token on the same system user, push it as above, rerun `ops-secrets.yml`, redeploy production ops, then revoke the old token on the system user.
