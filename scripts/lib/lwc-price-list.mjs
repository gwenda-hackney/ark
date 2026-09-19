/**
 * LWC customer price list (CSV export) → { sku: { name, pack, price } }.
 */
import { parseMoney } from "../../ops/site/functions/_lib/suppliers.js";

const SKU_RE = /^[A-Z]{2,4}[A-Z0-9]*\d+$/;
const PACK_RE = /^(KEG\S+|CASE\d+|BOTTLE)$/i;

export function parseCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function cleanLwcName(value) {
  return String(value || "")
    .replace(/\[(?:H|C|S)\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLwcPriceListCsv(text) {
  const bySku = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const sku = String(cols[0] || "")
      .trim()
      .toUpperCase();
    if (!SKU_RE.test(sku)) continue;
    const name = cleanLwcName(cols[3] || "");
    const pack = String(cols[6] || "")
      .trim()
      .toUpperCase();
    const price = parseMoney(cols[7]);
    if (!name || !PACK_RE.test(pack) || price == null) continue;
    bySku[sku] = { name, pack, price };
  }
  return bySku;
}

export function diffLwcPriceLists(previous, next) {
  const added = [];
  const removed = [];
  const changed = [];
  const prev = previous && typeof previous === "object" ? previous : {};
  const nxt = next && typeof next === "object" ? next : {};
  for (const sku of Object.keys(nxt)) {
    const after = nxt[sku];
    const before = prev[sku];
    if (!before) {
      added.push({ sku, ...after });
      continue;
    }
    if (
      before.price !== after.price ||
      String(before.pack || "") !== String(after.pack || "") ||
      String(before.name || "") !== String(after.name || "")
    ) {
      changed.push({ sku, before, after });
    }
  }
  for (const sku of Object.keys(prev)) {
    if (!nxt[sku]) removed.push({ sku, ...prev[sku] });
  }
  return { added, removed, changed };
}
