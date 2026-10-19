# Gwenda Wi‑Fi captive portal (Cloudflare Worker + UniFi Site Manager)

Captive portal for the UDR7 guest Wi‑Fi. Guests enter an email; the Worker signs it up
with the website's own sign-up (`shared/guests`: tag `wifi`, unsynced), in Baserow
`Subscribers` until `store:guests` says D1 (#127),
then authorizes the device through Ubiquiti’s **Site Manager cloud proxy**
(`api.ui.com`). The existing Mailchimp sync Worker picks up new rows hourly.

No LAN host required while the console is online at [unifi.ui.com](https://unifi.ui.com).

## Flow

1. Guest joins the Hotspot SSID
2. UniFi redirects to `https://<portal>/guest/s/default/?id=<mac>&ap=<ap>&…`
3. Guest submits email → new subscriber, or `wifi` merged onto an existing one's tags → Site Manager `authorize-guest`
4. Success page → `REDIRECT_URL` (default gwenda.co.uk)
5. Mailchimp sync applies every Tag when `Synced` is false

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

Sign-ups are saved to D1 (`WEBSITE_DB`, the `subscribers` table); Baserow is retired.
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
4. **Pre-authorization allowances** (walled garden): add that same hostname so
   guests can load the splash page before they are authorized  
   (D1 / Mailchimp stay server-side; no need to allowlist them for guests)
5. Keep the UDR online to UI.com; authorize calls go through Site Manager

### Test

1. Join the guest SSID from a phone
2. Captive sheet should show **Gwenda · Welcome aboard**
3. Submit an email
4. Subscribers: a new one tagged `wifi`, or `wifi` merged onto an existing email’s tags and marked unsynced
5. Mailchimp sync (hourly or manual) applies every tag (e.g. `prelaunch` + `wifi`)

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
| IPv4 | `dig +short wifi.gwenda.co.uk A` (Cloudflare anycast) |
| Domain | `wifi.gwenda.co.uk` |
| Pre-auth | `wifi.gwenda.co.uk` + those A records |

## Develop

```bash
npm test -w @gwenda/wifi-captive-portal
npm run typecheck -w @gwenda/wifi-captive-portal
```
