#!/usr/bin/env node
/**
 * Store one secret in Secrets Manager, by hand. Asks for the name, then the
 * value (hidden, so pasting is safe), and asks before replacing an existing
 * value. The name decides the project (SECRET_OWNERS); add a new name there
 * first. Needs bw-unlock: it writes with ark-local, never the CI token.
 *
 *   npm run secret:set
 */
import { createInterface } from "node:readline/promises";
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  listAllSmSecrets,
  ownerOf,
  parseSecretKey,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

// Piped input (scripts, tests) is read once, up front; a terminal is asked
// one question at a time.
const piped = process.stdin.isTTY
  ? null
  : (async () => {
      const lines = [];
      for await (const line of createInterface({ input: process.stdin })) lines.push(line);
      return lines;
    })();

async function ask(prompt) {
  if (piped) {
    process.stdout.write(prompt);
    const line = (await piped).shift() ?? "";
    process.stdout.write("\n");
    return line;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(prompt);
  rl.close();
  return answer;
}

/** Like ask, but the typed or pasted value is not shown. */
async function askHidden(prompt) {
  if (piped) return ask(prompt);
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") process.exit(130); // Ctrl-C
        if (char === "\u007f") value = value.slice(0, -1); // Backspace
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const accessToken = vaultSmAccessToken();
  if (!accessToken) throw new Error("The vault is locked. Run bw-unlock first.");

  const name = (await ask("Secret name (e.g. MAILCHIMP_API_KEY, SANITY_API_TOKEN__DEV): ")).trim();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error(`"${name}" isn't a secret name: capitals, digits and _ only.`);
  const owner = ownerOf(parseSecretKey(name).name);
  if (!owner) {
    throw new Error(`${name} isn't a known secret. Add its name to SECRET_OWNERS in scripts/lib/bitwarden-sm.mjs first.`);
  }

  const value = (await askHidden(`Value for ${name} (hidden): `)).trim();
  if (!value) throw new Error("No value given; nothing stored.");

  if (listAllSmSecrets({ accessToken }).has(name)) {
    const answer = (await ask(`${name} already exists in ${owner}. Replace it? [y/N] `)).trim();
    if (!/^y(es)?$/i.test(answer)) {
      console.log("Left as it was.");
      return;
    }
  }

  const result = upsertSmSecret({ key: name, value, accessToken });
  console.log(`${name}: ${result} (project ${owner}).`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
