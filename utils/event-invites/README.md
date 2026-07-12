# Event invites

Send special-event invitations to guests stored in a **ClickUp list** — email via SMTP, Instagram handles exported for manual DMs (Meta does not offer a simple DM API for one-off events).

## Setup

Uses `CLICKUP_API_KEY` from the workspace root `.env` (see `.cursor/skills/clickup/`).

```bash
# From monorepo root (ark/)
python3 -m venv utils/event-invites/.venv
utils/event-invites/.venv/bin/pip install -e utils/event-invites

# Or after devcontainer post-start (venv created automatically)
utils/event-invites/.venv/bin/event-invites --help
```

Copy `utils/event-invites/.env.example` values into `/workspace/.env` or export them:

| Variable | Purpose |
|----------|---------|
| `CLICKUP_INVITE_LIST_ID` | Guest list in ClickUp |
| `CLICKUP_INVITE_EMAIL_FIELD` | Custom field name (default `Email`) |
| `CLICKUP_INVITE_INSTAGRAM_FIELD` | Custom field name (default `Instagram`) |
| `SMTP_*` | Outbound email |
| `INVITE_EMAIL_SUBJECT` / `INVITE_EMAIL_BODY` | Message content (`{name}` in body) |

## Usage

**Preview** (no sends):

```bash
event-invites --dry-run --export-instagram /tmp/ig-guests.csv
```

**Send emails** to every task with an Email field:

```bash
event-invites --send-email
```

**Instagram** — export handles for manual DM or scheduling tool:

```bash
event-invites --export-instagram guests-instagram.csv
```

Combine flags as needed. Use `--limit 5` to test on a subset first.

## ClickUp list shape

Each guest is a **task** on the list. Expected custom fields:

- **Email** — used for SMTP invites
- **Instagram** — handle or profile URL; normalised to `@handle` in CSV export

Task name is used as the guest name in `{name}` substitution.

## Notes

- Instagram DMs cannot be automated reliably without Meta Business API approval; this tool exports a CSV for your manual workflow (or a future integration).
- Always run `--dry-run` before `--send-email` on a live list.
