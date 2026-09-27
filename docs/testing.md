# Testing

## Use cases first

The most important tests describe **what someone does** ("an editor creates a weekly series", "moves a night", "presses Update website") and check what they'd see and what reached the outside world. They drive the real API handlers, end to end, with every outside service faked in memory. Function-level unit tests are for tricky pure logic (recurrence rules, crops, slugs, diffs) where it's easier to cover every case in isolation. Don't add them by default.

## Ops: the fake world

`ops/site/functions/_test/fake-world.js` replaces global `fetch` with in-memory versions of everything ops talks to:

| Service | Faked as |
|---|---|
| Baserow (ops tables) | Tables built from `scripts/lib/baserow-ops-schema.mjs`, the same field definitions `setup-baserow-ops.mjs` uses. Link, select, file, batch and `link_row_has` filters behave like Baserow. |
| Baserow (Gwenda Config) | Its own table, reachable only with the config token, pre-filled with the Drive folder, calendar and Sanity project settings. |
| Sanity | Documents in memory, queried with **groq-js** (the real GROQ engine) under the `raw`, `published` and `previewDrafts` perspectives. Mutations: create, createOrReplace, createIfNotExists, patch (`set`, `setIfMissing`, `unset`), delete. |
| Google | Service-account tokens (a throwaway RSA key per run), Drive folders, Calendar events. |

Every world gets fresh random tokens, so ops' module-level caches never carry one test's data into another. Any outside call the fake doesn't know **throws with its URL**: a new integration shows up as a failing test, not a silent network call.

```js
import { callApi, createFakeWorld } from "../_test/fake-world.js";
import { onRequestPost as createEvent } from "../api/events/index.js";

const world = await createFakeWorld();
world.install();
const res = await callApi(world, createEvent, { method: "POST", path: "/api/events", body: { name: "…" } });
world.baserow.rows("Events");        // what ops saved
world.sanity.published("eventSeries"); // what's live
world.google.calendar();             // calendar entries
world.restore();
```

Use cases live in `ops/site/functions/use-cases/` and run with `npm test -w @gwenda/ops`. `use-cases/events.test.js` has an `editor(world)` helper (create, edit, add or edit a night, wait for the background job, Update website, and `sees()` for the status line the editor reads) to copy for other areas.

## Known bugs

A use case that finds a real bug stays in the suite, marked `{ todo: "known bug #N" }` with a comment linking the issue. It still runs but doesn't fail the build. The PR that fixes the bug removes the mark.

## Website

The website uses Vitest (`npm test -w @gwenda/web`). The same approach applies: drive the Pages Functions with faked Baserow, Sanity and email. Its shared fakes are still to come (#48).
