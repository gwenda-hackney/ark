# Notes for Claude

Architecture and conventions: [.github/copilot-instructions.md](.github/copilot-instructions.md). Secrets in full: [docs/env.md](docs/env.md). Reference images for design work (renders, logo concepts, food and room photos) are in [docs/brand/](docs/brand/README.md); look there before asking for them, and add new ones with `npm run brand:add -- <file>` rather than copying originals in.

## Secrets: you normally have access

The Bitwarden vault is usually unlocked in this container, and every npm script loads secrets itself. Do not tell the user you cannot reach the vault or a secret until `npm run env:status` says so.

- **Check with `npm run env:status`, not `bw status`.** Your shell may not have `BW_SESSION` exported, and plain `bw status` then reports `locked` while the vault is unlocked. `env:status` reads the session file (`/dev/shm/ark-secrets-<uid>/bw-session`, in RAM), as the scripts do. After a container restart the vault is locked until the user runs `bw-unlock`.
- **Run commands that need secrets through a wrapper:** npm scripts already do this. For anything else, use `node scripts/with-env.mjs <cmd>` (web runtime names, plus Cloudflare tokens) or `node scripts/with-ops-env.mjs <cmd>` (ops names). Example: `node scripts/with-env.mjs npx wrangler whoami`.
- **There are no secret files.** `.env.secrets` is gone on purpose and `.dev.vars` exists only as a symlink into RAM while `ops:dev` runs; do not recreate them as files. `.env` is optional (personal overrides; `FORMS_NOTIFY_EMAIL` defaults to the git email); local settings are `LOCAL_DEFAULTS` in `scripts/lib/load-env.mjs`, and `ARK_LOCAL_BW_TOKEN` must never be written to `.env`. Values are cached in RAM at `/dev/shm/ark-secrets-<uid>/`.
- **If `env:status` says locked,** ask the user to run `bw-unlock`. It needs their master password; you cannot do it yourself.
- **A secret changed in the Bitwarden web app?** Run `npm run env:secrets:refresh`. Pushes through `env:*:push` and the `setup:*` scripts clear the cache on their own.
- Never print secret values. Report names only.
- **Never import or run a `setup:*` script to inspect it.** Most act on import (create or revoke tokens, set GitHub secrets); read the source or pass `--dry-run`.
