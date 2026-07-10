# Gwenda utilities

Operational tools for Gwenda. Each utility is a self-contained package.

| Tool | Path | Stack |
|------|------|-------|
| **Event invites** | [`event-invites/`](event-invites/) | Python CLI |
| **Recipe cost webhook** | [`recipe-cost-webhook/`](recipe-cost-webhook/) | Cloudflare Worker — CI deploys on push to `main` when `utils/recipe-cost-webhook/**` changes |

## Development

From repo root:

```bash
npm install                              # Node workspaces (recipe-cost-webhook)
pip install -e utils/event-invites       # or use devcontainer venv
```

Shared secrets: workspace `/workspace/.env` (`CLICKUP_API_KEY`, SMTP, etc.).
