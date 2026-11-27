# Gwenda Wi‑Fi captive portal (Cloudflare Worker + UniFi Site Manager)

Captive portal for the UDR7 guest Wi‑Fi. Guests enter an email, kept with the website's
own sign-up for Wi‑Fi and service messages. Only a guest who ticks "Send me what’s on at
Gwenda" (unticked by default) goes on the mailing list (`marketing`). Saved
with the website's own sign-up (`shared/guests`: tag `wifi`, unsynced), in the website
D1 database (#127), then authorizes the device through Ubiquiti’s **Site Manager cloud proxy**
(`api.ui.com`). The existing Mailchimp sync Worker picks up new rows hourly.

No LAN host required while the console is online at [unifi.ui.com](https://unifi.ui.com).

## Flow

1. Guest joins the Hotspot SSID
2. UniFi redirects to `https://<portal>/guest/s/default/?id=<mac>&ap=<ap>&…`
3. Guest submits email, and ticks the newsletter box or not
4. Box ticked: a new subscriber on the mailing list, or an existing one with `wifi` added and
   consent recorded again (back on the list, even after unsubscribing; synced again)
5. Not ticked: a new address is kept off the mailing list (`marketing` 0, tag `wifi`); an
   existing one keeps its consent as it was. Either way `last_seen_on` is today
6. Site Manager `authorize-guest`. Getting online never waits on the save: a failed save is
   logged to Sentry, and while guests are frozen (#191) it isn't saved
7. Success page → `REDIRECT_URL` (default gwenda.co.uk)
8. Mailchimp sync sends unsynced subscribers on the mailing list only, and brings Mailchimp's
   unsubscribes back (`marketing` off)

## Setup

1. Create a **Site Manager API key** at [unifi.ui.com → Settings → API Keys](https://unifi.ui.com/settings/api-keys)  
   (this is **not** the local Network → Integrations key)
2. Store it in Secrets Manager: `UNIFI_SITE_MANAGER_API_KEY=… npm run env:web:push -- UNIFI_SITE_MANAGER_API_KEY`
3. Confirm `UNIFI_CONSOLE_ID` in `wrangler.toml` matches your console URL:

   `https://unifi.ui.com/consoles/{UNIFI_CONSOLE_ID}/network/…`

4. Deploy: merging to `release` runs the **Workers** workflow, which tests,
   uploads source maps to Sentry (`wifi-portal` project), deploys and syncs
   `UNIFI_SITE_MANAGER_API_KEY`. Run it by hand from Actions (worker:
   `wifi-captive-portal`) to redeploy without a change. When CI can't run:

```bash
# needs bw-unlock: CLOUDFLARE_API_TOKEN and UNIFI_SITE_MANAGER_API_KEY come from Secrets Manager
npm run setup:wifi-portal
```

Sign-ups are saved to D1 (`WEBSITE_DB`, the `subscribers` table).
Errors, including every failed UniFi authorise or sign-up save, go to Sentry, and
the Worker's logs are kept in the Cloudflare dashboard (Workers → Logs).

Local preview:

```bash
npm run wifi-portal
```

Loads `UNIFI_SITE_MANAGER_API_KEY` from Secrets Manager (after `bw-unlock`)
and starts Wrangler locally with it in a per-run env file in RAM (no `.dev.vars`).
Sign-ups go to the local D1.
Open the URL Wrangler prints (usually `http://127.0.0.1:8787/guest/s/default/?id=aa:bb:cc:dd:ee:ff`).

## Configure UniFi (UDR7)

Use the Hotspot UI you already have open, e.g.  
[Hotspot landing page](https://unifi.ui.com/consoles/A89C6C0EB1810000000009A42CB9000000000A2C1924000000006920A430:1883747293/network/default/clients/hotspot/landing-page).

1. **WiFi** → guest SSID → enable **Hotspot / Captive portal**
2. Authentication / portal type: **External portal server**
3. Set the external portal host to your Worker hostname, e.g.  
   `gwenda-wifi-captive-portal.<account>.workers.dev`  
   (or `wifi.gwenda.co.uk` once you attach a custom route)
4. **Pre-authorization allowances** (walled garden): add the hostnames
   `wifi.gwenda.co.uk`, `gwenda.co.uk` and `www.gwenda.co.uk`, so guests can load the
   splash page, and the Wi‑Fi terms and privacy policy it links to, before they are
   authorized.  
   (D1 / Mailchimp stay server-side; no need to allowlist them for guests)

   **The host names aren't enough on their own (#388).** On our UDR7 (Network 11.0.104,
   guest network in the Hotspot zone) UniFi doesn't apply host names in this list: a guest
   gets the pop-up but a blank page, whatever DNS they use. What lets them through is the
   portal's **addresses** in the list, and the portal IP field set to one of them.
   Cloudflare changes those addresses without notice, so the portal keeps them up to date
   itself: every 15 minutes (`scheduled`, `src/portal-addresses.ts`) it looks up
   `wifi.gwenda.co.uk` and, if the addresses have changed, updates the list and the portal IP
   through Site Manager and reports it to Sentry (an email to alerts@). It only touches
   single addresses in Cloudflare's ranges; the host names and anything else stay. Don't
   remove the addresses by hand.
5. Keep the UDR online to UI.com; authorize calls go through Site Manager

### Test

1. Join the guest SSID from a phone
2. Captive sheet should show **Gwenda · Welcome aboard**
3. Submit a new email without ticking the box: you get online, and Subscribers has it tagged
   `wifi` with `marketing` 0 and today's `last_seen_on`; the sync never sends it
4. Submit another email with the box ticked: in Subscribers a new one tagged `wifi` with
   `marketing` 1, or `wifi` merged onto an existing email’s tags, marked unsynced
5. Mailchimp sync (hourly or manual) applies every tag (e.g. `website` + `wifi`)

## Secrets / vars

| Name | Where | Notes |
|---|---|---|
| `UNIFI_SITE_MANAGER_API_KEY` | Worker secret | From unifi.ui.com API Keys |
| `UNIFI_CONSOLE_ID` | `wrangler.toml` `[vars]` | From the Site Manager URL |
| `WEBSITE_DB` | `wrangler.toml` D1 binding | Production `gwenda-website`: subscribers |
| `WIFI_SUBSCRIBE_TAG` | vars | Default `wifi` |
| `UNIFI_GUEST_MINUTES` | vars | Default `1440` |
| `REDIRECT_URL` | vars | Default `https://gwenda.co.uk` |

## Custom domain

Production host: **`wifi.gwenda.co.uk`** (Wrangler `custom_domain` on the Worker).

After deploy, UniFi should use:

| Field | Value |
|---|---|
| Domain | `wifi.gwenda.co.uk` |
| Pre-auth | `wifi.gwenda.co.uk`, `gwenda.co.uk`, `www.gwenda.co.uk`, plus the portal's current addresses (kept up to date by the portal, #388) |
| Portal IP | the portal's first current address (kept up to date by the portal) |

## Develop

```bash
npm test -w @gwenda/wifi-captive-portal
npm run typecheck -w @gwenda/wifi-captive-portal
```
