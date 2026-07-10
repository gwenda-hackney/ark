/**
 * Create and push an annotated CalVer git tag for a production release.
 */
import { spawnSync } from "node:child_process";

const version = process.env.RELEASE_VERSION;
if (!version) {
  console.error("Missing RELEASE_VERSION");
  process.exit(1);
}

const exists = spawnSync("git", ["rev-parse", version], { encoding: "utf8" });
if (exists.status === 0) {
  console.log(`Tag ${version} already exists — skipping.`);
  process.exit(0);
}

spawnSync("git", ["config", "user.name", "github-actions[bot]"], {
  stdio: "inherit",
});
spawnSync(
  "git",
  [
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ],
  {
    stdio: "inherit",
  },
);

const tag = spawnSync(
  "git",
  ["tag", "-a", version, "-m", `Production release ${version}`],
  {
    stdio: "inherit",
  },
);
if (tag.status !== 0) process.exit(tag.status || 1);

const push = spawnSync("git", ["push", "origin", version], {
  stdio: "inherit",
});
if (push.status !== 0) process.exit(push.status || 1);

console.log(`Tagged and pushed ${version}.`);
