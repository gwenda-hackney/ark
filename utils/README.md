# Operational tools for Gwenda. Each utility is a self-contained package.

| Tool | Path | Stack |
|------|------|-------|
| **Event invites** | [`event-invites/`](event-invites/) | TypeScript CLI — ClickUp guest list → Baserow → email + Instagram DM |
| **Recipe cost webhook** | [`recipe-cost-webhook/`](recipe-cost-webhook/) | Cloudflare Worker — ClickUp → recipe costs |
| **Site deploy webhook** | [`site-deploy-webhook/`](site-deploy-webhook/) | Cloudflare Worker — Studio → GitHub content deploy |

## Development

From repo root:

```bash
npm install
npm run event-invites -- --help
```

Shared secrets: repo-root `.env` (`CLICKUP_API_KEY`, `SMTP_*`, `INSTAGRAM_*`, etc.).
