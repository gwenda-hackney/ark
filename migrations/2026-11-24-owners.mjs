/**
 * Access by area (#375): the owners. dscalamogna@ and lfersini@ get the
 * Owner role (everything in ops); everyone else keeps no role, which is the
 * default role, Manager: what they could do before roles.
 *
 * Before the new code deploys (pre), so the owners are owners from its first
 * request. Needs the roles schema (db/ops/migrations/0021_roles.sql), which
 * the deploy applies first. Goes through the users repository; an address
 * not on the users list is said, not added. Safe to run again: it writes
 * only a role that differs. Supports --dry-run.
 */
import { d1UserRepository } from "../ops/site/src/users/server/adapters/d1-users.js";
import { OWNER_ROLE_ID } from "../ops/site/src/users/server/role-repository.js";
import { databaseForMigration } from "../scripts/lib/d1-rehearsal.mjs";

export const app = "ops";
export const phase = "pre";
export const about = "Access: dscalamogna@ and lfersini@ are owners";

export const OWNERS = ["dscalamogna@gwenda.co.uk", "lfersini@gwenda.co.uk"];

/** Give each owner the Owner role; returns how many changed. On a dry run `users` is a copy, so it writes there too. */
export async function makeOwners(users, log, { dryRun = false } = {}) {
  const everyone = await users.list();
  let changed = 0;
  for (const email of OWNERS) {
    const user = everyone.find((candidate) => candidate.email === email);
    if (!user) {
      log(`${email} isn't on the ops users list: add them in Users, then run this again.`);
      continue;
    }
    if (user.roleId === OWNER_ROLE_ID) {
      log(`${email} is an owner already.`);
      continue;
    }
    log(`${dryRun ? "would make" : "made"} ${email} an owner`);
    await users.update(user.id, { roleId: OWNER_ROLE_ID });
    changed += 1;
  }
  return changed;
}

export async function up({ env, d1, log, dryRun = false }) {
  const db = await databaseForMigration(d1("ops"), { env, role: "ops", tables: ["users", "roles"], dryRun, log });
  const changed = await makeOwners(d1UserRepository(db), log, { dryRun });
  if (!changed) log("Nothing to do: the owners are owners.");
  else if (dryRun) log("Dry run: that was on a copy; nothing was written.");
}
