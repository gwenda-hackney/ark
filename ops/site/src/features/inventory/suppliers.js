const URL_LINE = /^https?:\/\/\S+$/i;

export function parseProductUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!URL_LINE.test(raw)) return "";
  return raw;
}

/** Accept a full URL or a bare host. Empty stays empty. */
export function normalizeWebsite(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const direct = parseProductUrl(raw);
  if (direct) return direct;
  if (/^https?:\/\//i.test(raw)) return "";
  return parseProductUrl(`https://${raw.replace(/^\/+/, "")}`);
}

export function findSupplierNameClash(entries, name, { exceptId } = {}) {
  const needle = String(name || "")
    .trim()
    .toLowerCase();
  if (!needle) return null;
  const except = exceptId != null && exceptId !== "" ? String(exceptId) : "";
  return (
    (entries || []).find((entry) => {
      const id = String(entry?.id ?? entry?._id ?? "");
      if (except && id === except) return false;
      return String(entry?.name || "").trim().toLowerCase() === needle;
    }) || null
  );
}

/** Hostname (no www) → supplier row to find-or-create. */
export const KNOWN_HOST_SUPPLIERS = [
  {
    hosts: ["hillsprospect.com"],
    name: "Hills Prospect",
    website: "https://www.hillsprospect.com",
  },
  {
    hosts: ["lwc-drinks.co.uk", "lwcdrinks.com"],
    name: "LWC Drinks",
    website: "https://www.lwc-drinks.co.uk",
  },
  {
    hosts: ["alivini.com"],
    name: "Alivini",
    website: "https://www.alivini.com",
  },
];

export const SEED_SUPPLIERS = [
  { name: "Hills Prospect", website: "https://www.hillsprospect.com" },
  { name: "LWC Drinks", website: "https://www.lwc-drinks.co.uk" },
  { name: "Alivini", website: "https://www.alivini.com" },
  { name: "D&L", website: "" },
];

export function skuFromProductUrl(url) {
  const parsed = parseProductUrl(url);
  if (!parsed) return "";
  const fromPath = parsed.match(/\/P\/([A-Z0-9]+)\//i);
  if (fromPath) return fromPath[1].toUpperCase();
  return "";
}

export function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatGbp(value) {
  const n = parseMoney(value);
  if (n == null) return "";
  return `£${n.toFixed(2)}`;
}

export function looksLikeOnlyUrls(value) {
  const raw = String(value || "").trim();
  if (!raw) return true;
  return raw.split(/\r?\n/).every((line) => {
    const trimmed = line.trim();
    return !trimmed || URL_LINE.test(trimmed);
  });
}

function registrableHost(hostname) {
  return String(hostname || "")
    .trim()
    .replace(/^www\./i, "")
    .toLowerCase();
}

export function supplierFromUrl(url) {
  const productUrl = parseProductUrl(url);
  if (!productUrl) return null;
  let hostname = "";
  try {
    hostname = registrableHost(new URL(productUrl).hostname);
  } catch {
    return null;
  }
  const known = KNOWN_HOST_SUPPLIERS.find((row) =>
    row.hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)),
  );
  if (known) {
    return { name: known.name, website: known.website, productUrl };
  }
  return {
    name: hostname || "Supplier",
    website: hostname ? `https://${hostname}` : "",
    productUrl,
  };
}

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Grid / notes format, one supplier per line:
 *   Hills Prospect | https://…
 *   https://…          (name inferred from host)
 *   Hills Prospect     (no product page yet)
 */
export function parseSupplierEntries(value) {
  const raw = typeof value === "string" ? value : "";
  const seen = new Set();
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pipe = trimmed.indexOf("|");
    let name = "";
    let productUrl = "";
    if (pipe >= 0) {
      name = trimmed.slice(0, pipe).trim();
      productUrl = parseProductUrl(trimmed.slice(pipe + 1));
    } else if (URL_LINE.test(trimmed)) {
      productUrl = trimmed;
    } else {
      name = trimmed;
    }
    if (!name && productUrl) {
      const inferred = supplierFromUrl(productUrl);
      name = inferred?.name || "";
    }
    if (!name && !productUrl) continue;
    const key = `${name.toLowerCase()}|${productUrl.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sku = skuFromProductUrl(productUrl);
    out.push({
      name,
      ...(productUrl ? { productUrl } : {}),
      ...(sku ? { sku } : {}),
    });
  }
  return out;
}

export function formatSupplierEntries(entries) {
  if (!Array.isArray(entries)) return "";
  return entries
    .map((entry) => {
      const name = text(entry?.name);
      const productUrl = parseProductUrl(entry?.productUrl);
      if (name && productUrl) return `${name} | ${productUrl}`;
      return productUrl || name;
    })
    .filter(Boolean)
    .join("\n");
}

export function normalizeSupplierEntries(input) {
  if (Array.isArray(input)) {
    const fromObjects = [];
    const seen = new Set();
    for (const entry of input) {
      if (typeof entry === "string") {
        fromObjects.push(...parseSupplierEntries(entry));
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const productUrl = parseProductUrl(entry.productUrl);
      let name = text(entry.name);
      if (!name && productUrl) name = supplierFromUrl(productUrl)?.name || "";
      if (!name && !productUrl) continue;
      const sku = text(entry.sku) || skuFromProductUrl(productUrl);
      const pack = text(entry.pack);
      const price = parseMoney(entry.price);
      const key = sku
        ? `${name.toLowerCase()}|sku:${sku.toUpperCase()}`
        : `${name.toLowerCase()}|${productUrl.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fromObjects.push({
        ...(entry.supplierId != null && String(entry.supplierId).trim()
          ? { supplierId: String(entry.supplierId).trim() }
          : {}),
        ...(entry._id != null && String(entry._id).trim()
          ? { _id: String(entry._id).trim() }
          : {}),
        name,
        ...(productUrl ? { productUrl } : {}),
        ...(sku ? { sku } : {}),
        ...(pack ? { pack } : {}),
        ...(price != null ? { price } : {}),
      });
    }
    return fromObjects;
  }
  if (typeof input === "string") return parseSupplierEntries(input);
  return [];
}
