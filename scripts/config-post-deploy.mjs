#!/usr/bin/env node
/**
 * After a deploy: clean up config the new code no longer reads.
 *
 * Config changes that would break the code still running go here, never in a
 * setup script run beforehand: first add what both versions need, deploy,
 * then remove the old (shared/config.js RETIRED_SETTINGS). CI runs this after
 * the prod ops deploy (apps.yml). Safe to re-run.
 *
 *   node scripts/config-post-deploy.mjs
 */
import { RETIRED_SETTINGS, removeRetiredSettings } from "../shared/config.js";

const removed = await removeRetiredSettings(process.env);
for (const key of RETIRED_SETTINGS) {
  console.log(removed[key] ? `- ${key}: removed ${removed[key]} row(s)` : `  ${key}: nothing to remove`);
}
