#!/usr/bin/env node
/**
 * Apple Wallet pass signing setup (no Mac required).
 *
 * Step 1 — generate a CSR to upload in Apple Developer:
 *   npm run setup:apple-wallet:csr
 *
 * Step 2 — after Apple issues the Pass Type ID certificate (.cer), import it:
 *   npm run setup:apple-wallet:import -- path/to/pass.cer
 *
 * Optional env before import (or add to .env manually):
 *   APPLE_WALLET_PASS_TYPE_ID=pass.co.uk.gwenda.event
 *   APPLE_WALLET_TEAM_ID=XXXXXXXXXX
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK_DIR = resolve(ROOT, ".apple-wallet");
const ENV_PATH = resolve(ROOT, ".env");

const CSR_PATH = resolve(WORK_DIR, "signing.csr");
const KEY_PATH = resolve(WORK_DIR, "signing.key");
const CERT_PEM_PATH = resolve(WORK_DIR, "signer.pem");
const WWDR_PATH = resolve(WORK_DIR, "wwdr.pem");
const WWDR_URL =
  "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer";

function runOpenSsl(args) {
  const result = spawnSync("openssl", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `openssl ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const values = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function upsertEnv(entries) {
  const lines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8").split("\n") : [];
  const keys = new Set(Object.keys(entries));
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return true;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return true;
    return !keys.has(trimmed.slice(0, eq).trim());
  });

  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();

  kept.push("", "# ── Apple Wallet (RSVP .pkpass attachment) ──");
  for (const [key, value] of Object.entries(entries)) {
    kept.push(`${key}="${value.replaceAll('"', '\\"')}"`);
  }
  kept.push("");
  writeFileSync(ENV_PATH, `${kept.join("\n")}`);
}

function ensureWorkDir() {
  mkdirSync(WORK_DIR, { recursive: true, mode: 0o700 });
}

function generateCsr() {
  ensureWorkDir();
  if (existsSync(KEY_PATH)) {
    console.log(`Private key already exists: ${KEY_PATH}`);
    console.log("Delete .apple-wallet/ first if you need a fresh key pair.");
  } else {
    runOpenSsl([
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      KEY_PATH,
      "-out",
      CSR_PATH,
      "-subj",
      "/CN=Gwenda Pass/O=Gwenda/C=GB",
    ]);
    console.log(`Wrote private key: ${KEY_PATH}`);
    console.log(`Wrote CSR:         ${CSR_PATH}`);
  }

  console.log("");
  console.log("Next in Apple Developer:");
  console.log("1. Identifiers → your Pass Type ID → Create Certificate");
  console.log(`2. Upload: ${CSR_PATH}`);
  console.log("3. Download the issued .cer file");
  console.log("4. Run: npm run setup:apple-wallet:import -- path/to/downloaded.cer");
}

async function fetchWwdr() {
  ensureWorkDir();
  const derPath = resolve(WORK_DIR, "wwdr.cer");
  const response = await fetch(WWDR_URL);
  if (!response.ok) {
    throw new Error(`Could not download WWDR cert (${response.status})`);
  }
  writeFileSync(derPath, Buffer.from(await response.arrayBuffer()));
  const pem = runOpenSsl(["x509", "-inform", "DER", "-in", derPath, "-outform", "PEM"]).trim();
  writeFileSync(WWDR_PATH, `${pem}\n`, { mode: 0o600 });
  console.log(`Wrote WWDR cert: ${WWDR_PATH}`);
  return pem;
}

function importCer(cerPath) {
  if (!existsSync(cerPath)) {
    throw new Error(`Certificate not found: ${cerPath}`);
  }
  if (!existsSync(KEY_PATH)) {
    throw new Error(`Missing ${KEY_PATH}. Run npm run setup:apple-wallet:csr first.`);
  }

  ensureWorkDir();
  const signerCert = runOpenSsl([
    "x509",
    "-inform",
    "DER",
    "-in",
    cerPath,
    "-outform",
    "PEM",
  ]).trim();
  writeFileSync(CERT_PEM_PATH, `${signerCert}\n`, { mode: 0o600 });

  const signerKey = readFileSync(KEY_PATH, "utf8").trim();
  const env = loadDotEnv();
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID || env.APPLE_WALLET_PASS_TYPE_ID;
  const teamId = process.env.APPLE_WALLET_TEAM_ID || env.APPLE_WALLET_TEAM_ID;

  if (!passTypeId || !teamId) {
    console.log("");
    console.log("Set these before import (or add to .env manually):");
    console.log("  export APPLE_WALLET_PASS_TYPE_ID=pass.co.uk.gwenda.event");
    console.log("  export APPLE_WALLET_TEAM_ID=XXXXXXXXXX");
    throw new Error("APPLE_WALLET_PASS_TYPE_ID and APPLE_WALLET_TEAM_ID are required.");
  }

  return { passTypeId, teamId, signerCert, signerKey };
}

async function importCommand(cerPath) {
  const wwdr = await fetchWwdr();
  const { passTypeId, teamId, signerCert, signerKey } = importCer(cerPath);

  upsertEnv({
    APPLE_WALLET_PASS_TYPE_ID: passTypeId,
    APPLE_WALLET_TEAM_ID: teamId,
    APPLE_WALLET_SIGNER_CERT: signerCert,
    APPLE_WALLET_SIGNER_KEY: signerKey,
    APPLE_WALLET_WWDR_CERT: wwdr,
  });

  console.log("");
  console.log(`Updated ${ENV_PATH} with Apple Wallet signing vars.`);
  console.log("Restart npm run web:dev, RSVP Yes, and open gwenda-ticket.pkpass on an iPhone.");
}

const command = process.argv[2];
const arg = process.argv[3];

if (command === "csr") {
  generateCsr();
} else if (command === "import") {
  if (!arg) {
    console.error("Usage: npm run setup:apple-wallet:import -- path/to/pass.cer");
    process.exit(1);
  }
  await importCommand(resolve(arg));
} else {
  console.error("Usage:");
  console.error("  npm run setup:apple-wallet:csr");
  console.error("  npm run setup:apple-wallet:import -- path/to/pass.cer");
  process.exit(1);
}
