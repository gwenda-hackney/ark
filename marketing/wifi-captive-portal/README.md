# Gwenda Wi‑Fi captive portal (Cloudflare Worker + UniFi Site Manager)

Captive portal for the UDR7 guest Wi‑Fi. Guests enter an email; the Worker writes
the same Baserow subscribe table as the website (`Tag` includes `wifi`, `Synced: false`),
then authorizes the device through Ubiquiti’s **Site Manager cloud proxy**
(`api.ui.com`). The existing Mailchimp sync Worker picks up new rows hourly.

No LAN host required while the console is online at [unifi.ui.com](https://unifi.ui.com).

## Flow

1. Guest joins the Hotspot SSID
2. UniFi redirects to `https://<portal>/guest/s/default/?id=<mac>&ap=<ap>&…`
3. Guest submits email → Baserow create or merge `wifi` onto existing tags → Site Manager `authorize-guest`
4. Success page → `REDIRECT_URL` (default gwenda.co.uk)
5. Mailchimp sync applies every Tag when `Synced` is false

## Setup

1. Create a **Site Manager API key** at [unifi.ui.com → Settings → API Keys](https://unifi.ui.com/settings/api-keys)  
   (this is **not** the local Network → Integrations key)
2. Store it in Secrets Manager: `UNIFI_SITE_MANAGER_API_KEY=… npm run env:web:push -- UNIFI_SITE_MANAGER_API_KEY`
3. Confirm `UNIFI_CONSOLE_ID` in `wrangler.toml` matches your console URL:

   `https://unifi.ui.com/consoles/{UNIFI_CONSOLE_ID}/network/…`

4. Deploy:

```bash
# needs bw-unlock: CLOUDFLARE_API_TOKEN, BASEROW_API_KEY, UNIFI_SITE_MANAGER_API_KEY come from Secrets Manager
npm run setup:wifi-portal
```

That deploys `gwenda-wifi-captive-portal` and sets its Worker secrets.

Local preview:

```bash
npm run wifi-portal
```

Loads `BASEROW_API_KEY` and `UNIFI_SITE_MANAGER_API_KEY` from Secrets Manager (after `bw-unlock`)
and starts Wrangler locally with them in a per-run env file in RAM (no `.dev.vars`).
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
   (Baserow / Mailchimp stay server-side; no need to allowlist them for guests)
5. Keep the UDR online to UI.com; authorize calls go through Site Manager

### Test

1. Join the guest SSID from a phone
2. Captive sheet should show **Gwenda · Welcome aboard**
3. Submit an email
4. Baserow: create row with `Tag = [wifi]`, or merge `wifi` onto an existing email’s tags and set `Synced = false`
5. Mailchimp sync (hourly or manual) applies every Baserow Tag (e.g. `prelaunch` + `wifi`)

## Secrets / vars

| Name | Where | Notes |
|---|---|---|
| `BASEROW_API_KEY` | Worker secret | Same as site subscribe |
| `UNIFI_SITE_MANAGER_API_KEY` | Worker secret | From unifi.ui.com API Keys |
| `UNIFI_CONSOLE_ID` | `wrangler.toml` `[vars]` | From the Site Manager URL |
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
npm run deploy -w @gwenda/wifi-captive-portal
```
