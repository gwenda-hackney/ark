#!/usr/bin/env node
/**
 * Open or update the release PR from main into release (#301):
 *
 *   npm run release:pr                 open it, or update the open one
 *   npm run release:pr -- --dry-run    print its title and body only
 *
 * Titled "Release: #a #b …", listing each PR going out. When release already
 * has main, says so and does nothing. Uses your gh login; the owner merges the
 * PR (with a merge commit), and the push to release deploys as before.
 */
import { execFileSync } from "node:child_process";
import { releasePr } from "./lib/release-pr.mjs";

const run = (cmd) => (args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

releasePr({ git: run("git"), gh: run("gh"), dryRun: process.argv.includes("--dry-run") });
