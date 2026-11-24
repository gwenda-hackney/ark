/**
 * The record of which deploy migrations have run in one environment: the
 * data_migrations table in its config database (db/config/migrations/0003).
 * runMigrations (./migrations.mjs) skips what it holds and adds each one-off
 * once it succeeds; standing migrations (`every`) aren't recorded.
 *
 * Config is never copied from production to dev, so the production → dev copy
 * replaces dev's record with production's (dev-copy): dev's data is then
 * production's, and a migration dev ran that production hasn't runs on it
 * again at dev's next deploy.
 */
import { all, batch, run, statement } from "../../shared/d1.js";

/** @param {any} db this environment's config D1 database */
export function migrationRecord(db) {
  return {
    /** The names of the migrations that have run here. */
    async ran() {
      return new Set((await all(db, "SELECT name FROM data_migrations")).map((row) => row.name));
    },
    /** Note that a migration has run here. */
    async add({ name, app = "", phase = "" }) {
      await run(db, "INSERT OR REPLACE INTO data_migrations (name, app, phase) VALUES (?, ?, ?)", [name, app, phase]);
    },
    /** Every row, for copying to another environment. */
    async rows() {
      return all(db, "SELECT name, app, phase, ran_at FROM data_migrations ORDER BY name");
    },
    /** Make this record exactly `rows` (another environment's), in one transaction. */
    async replaceWith(rows) {
      await batch(db, [
        statement(db, "DELETE FROM data_migrations"),
        ...rows.map((row) =>
          statement(db, "INSERT INTO data_migrations (name, app, phase, ran_at) VALUES (?, ?, ?, ?)", [row.name, row.app, row.phase, row.ran_at]),
        ),
      ]);
    },
  };
}
