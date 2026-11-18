#!/usr/bin/env node
/**
 * The website and ops together, on the ports the dev container maps:
 * website 4321, ops 5174 (its functions 8788).
 *
 *   npm run dev
 *
 * Each app's output is labelled. Ctrl+C stops both, and if one stops on its
 * own the other is stopped too, so nothing is left holding a port.
 */
import { spawn } from "node:child_process";

const APPS = [
  { label: "web", script: "web:dev", colour: 33 },
  { label: "ops", script: "ops:dev", colour: 36 },
];

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children)
    if (child.exitCode === null) {
      // The app runs in its own process group: stop the whole group
      try {
        process.kill(-child.pid, "SIGINT");
      } catch {
        child.kill("SIGINT");
      }
    }
  setTimeout(() => process.exit(code), 3000).unref();
}

/** Writes an app's output line by line, each line labelled with its app. */
function labelled(stream, out, prefix) {
  let rest = "";
  stream.on("data", (chunk) => {
    const lines = (rest + chunk).split("\n");
    rest = lines.pop();
    for (const line of lines) out.write(`${prefix} ${line}\n`);
  });
  stream.on("end", () => rest && out.write(`${prefix} ${rest}\n`));
}

for (const { label, script, colour } of APPS) {
  const child = spawn("npm", ["run", script], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  const prefix = `\x1b[${colour}m[${label}]\x1b[0m`;
  labelled(child.stdout, process.stdout, prefix);
  labelled(child.stderr, process.stderr, prefix);
  child.on("exit", (code) => {
    if (!stopping)
      console.log(`${prefix} stopped (${code ?? "signal"}): stopping the rest`);
    stopAll(code ?? 0);
    if (children.every((c) => c.exitCode !== null || c.signalCode))
      process.exit(code ?? 0);
  });
  children.push(child);
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stopAll(0));
