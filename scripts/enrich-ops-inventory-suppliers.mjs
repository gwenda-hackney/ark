#!/usr/bin/env node
/**
 * Attach inventory items to supplier rows (junction + product URL)
 * and pull ABV from those pages (Hills Prospect embeds AddFil_…_ABV).
 *
 * Usage:
 *   node --env-file=.env scripts/enrich-ops-inventory-suppliers.mjs
 *   node --env-file=.env scripts/enrich-ops-inventory-suppliers.mjs --dry-run
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  looksLikeOnlyUrls,
  parseProductUrl,
  skuFromProductUrl,
  supplierFromUrl,
} from "../ops/site/functions/_lib/suppliers.js";

const LWC_PRICES = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "data/lwc-price-list.json"),
    "utf8",
  ),
);

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
const inventoryTableId = process.env.BASEROW_OPS_INVENTORY_TABLE_ID?.trim();
const suppliersTableId = process.env.BASEROW_OPS_SUPPLIERS_TABLE_ID?.trim();
const inventorySuppliersTableId =
  process.env.BASEROW_OPS_INVENTORY_SUPPLIERS_TABLE_ID?.trim();
const dryRun = process.argv.includes("--dry-run");

if (!apiKey || !inventoryTableId || !suppliersTableId || !inventorySuppliersTableId) {
  console.error(
    "Need BASEROW_API_KEY and BASEROW_OPS_{INVENTORY,SUPPLIERS,INVENTORY_SUPPLIERS}_TABLE_ID",
  );
  console.error("Run npm run setup:baserow-ops first.");
  process.exit(1);
}

/** Inventory name → Hills Prospect / LWC product URLs (codes from LWC price list). */
const SUPPLIER_LINKS = {
  "Arboretum Gin": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPG47363/arber-arboretum-gin",
  ],
  "Renegade Gin": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPG47346/renegade-gin",
  ],
  "42 Below Vodka": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPV47006/42-below-vodka",
  ],
  "Moonshine Vodka": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPV47466/moonshine-vodka",
  ],
  "Buen Amigo Silver Tequila": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47686/tequila-buen-amigo-silver",
  ],
  "Bandero Premium Blanco": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47719/bandero-premium-blanco",
  ],
  "Cazadores Reposado Tequila": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47645/cazadores-reposado-tequila",
  ],
  "Astral Tequila Blanco": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47775/astral-tequila-blanco",
  ],
  "Ilegal Joven Mezcal": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47535/ilegal-joven-mezcal",
  ],
  "Ojo de Dios Mezcal Joven": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47772/ojo-de-dios-mezcal-joven",
  ],
  "El Dorado 12 Year Old Rum": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPR47046/el-dorado-12-year-old-rum",
  ],
  "Admiral's Old J Tiki Fire Spiced Rum": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPR54016/admirals-old-j-spiced-rum",
  ],
  "Bacardi Reserva Ocho Rum": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPR47008/bacardi-reserva-ocho-rum",
  ],
  "Juan de la Costa Spiced Rum": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPR47395/juan-de-la-costa-spiced-rum",
  ],
  "Iron Wheel Kentucky Bourbon": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW47364/iron-wheel-bourbon",
  ],
  "Jameson Black Barrel": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW47318/jameson-black-barrel-irish-whiskey",
  ],
  "Jameson Irish Whiskey": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW54006/jameson-irish-whiskey",
  ],
  "Slane Irish Whiskey": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW47209/slane-irish-whiskey",
  ],
  "Maker's Mark 46": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW47207/makers-mark-46-bourbon-whiskey",
  ],
  "Laphroaig 10 Year Old Whisky": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPW47015/laphroaig-10-year-old-whisky",
  ],
  "Pernod Absinthe Supérieure": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPA47018/pernod-absinthe-sup%C3%A9rieure",
  ],
  "Sombrero Crema de Plátano y Tequila": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47777/sombrero-mexicano-banana-cream-liquor-with-tequila",
  ],
  "Sombrero Crema de Maracuyá": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47704/sombrero-mexicano-passion-fruit-cream-liquor-with-tequila",
  ],
  "Vecchia Romagna Etichetta Nera": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPB47305/vecchia-romagna-etichetta-nera",
  ],
  Italicus: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47375/italicus-rosolio-di-bergamotto-bergamot-liqueur",
  ],
  "St-Germain": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47181/st-germain-elderflower-liquor",
  ],
  Campari: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPA47010/campari-bitter",
  ],
  Aperol: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47034/aperol",
  ],
  "Amaro Montenegro": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47373/amaro-montenegro-liqueur",
  ],
  "Martini Riserva Speciale Bitter": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPA47035/martini-riserva-speciale-bitter",
  ],
  "Martini Rosso": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPA47002/martini-rosso",
  ],
  Borghetti: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47706/blend-coffee-liqueur",
  ],
  Disaronno: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47005/disaronno-amaretto-liqueur",
  ],
  "Giffard Triple Sec": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47336/giffard-pacifico-triple-sec-liqueur",
  ],
  "Monin Blue Curaçao": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47117/monin-blue-curacao-liqueur",
  ],
  "Corky's Sour Cherry Schnapps": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPV47023/corkys-sour-cherry-schnapps",
  ],
  "Narano Bitter Orange": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47652/narano-bitter-orange-liqueur",
  ],
  Limoncello: [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47773/pallini-limoncello",
  ],
  "Angostura Bitters": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL05005/angostura-bitters",
  ],
  "Sugar syrup": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47227/funkin-sugar-cane-syrup",
  ],
  "Banana syrup": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47307/monin-syrup-banana",
  ],
  "Strawberry syrup": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47245/monin-syrup-strawberry",
  ],
  "Mint syrup": [
    "https://www.hillsprospect.com/displayitemdetails/P/SPL47359/monin-syrup-frosted-mint",
  ],
  "Apple juice": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSJ51024/sunpride-apple-juice",
  ],
  "Pineapple juice": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSJ51022/sunpride-pineapple",
  ],
  "Grapefruit juice": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSJ51005/sunpride-grapefruit",
  ],
  "Orange juice": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSJ51036/sunpride-orange",
  ],
  "Passion fruit puree": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSJ51004/rubicon-passion-fruit",
  ],
  "Coca-Cola": [
    "https://www.hillsprospect.com/displayitemdetails/P/CCM23006/coke-330ml",
  ],
  "Soda water": [
    "https://www.hillsprospect.com/displayitemdetails/P/MLM14007/marlish-soda-water",
  ],
  "Tonic water": [
    "https://www.hillsprospect.com/displayitemdetails/P/MLM15005/marlish-premium-tonic",
  ],
  "Lemon soda": [
    "https://www.hillsprospect.com/displayitemdetails/P/MLM14004/marlish-lemonade",
  ],
  "Ginger beer": [
    "https://www.hillsprospect.com/displayitemdetails/P/MLM14006/marlish-ginger-ale",
  ],
  "Tiny Rebel IPA": [
    "https://www.hillsprospect.com/displayitemdetails/P/TRD78004/tiny-rebel-rebel-ipa",
  ],
  "Gwenda Pilsner": [
    "https://www.hillsprospect.com/displayitemdetails/P/MSD87018/pilsner-lager",
  ],
  "Caffrey's Black Stout": [
    "https://www.hillsprospect.com/displayitemdetails/P/CHD78006/caffreys-black-stout",
  ],
};

/** Kinds where ABV 0 from the supplier page is meaningful (keep as "0"). */
const KEEP_ZERO_ABV = new Set(["beer"]);

const ABV_RE = /AddFil_PRODEX1_STPROD_1_ABV"\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
const SIZE_RE = /AddFil_PRODEX1_STPROD_1_SIZE"\s*:\s*"([^"]*)"/;
const NET_PRICE_RE = /"CurDPNet"\s*:\s*([0-9]+(?:\.[0-9]+)?)/;

async function baserow(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} → ${response.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

async function listRows(tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await baserow(
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload.next) break;
    page += 1;
  }
  return rows;
}

function linkId(value) {
  if (Array.isArray(value) && value[0]) {
    const first = value[0];
    if (typeof first === "number") return first;
    if (first && typeof first === "object" && first.id != null) return Number(first.id);
  }
  return null;
}

function lwcForUrl(url) {
  const sku = skuFromProductUrl(url);
  const hit = sku ? LWC_PRICES[sku] : null;
  if (!sku) return { sku: "", pack: "", price: null };
  return {
    sku,
    pack: hit?.pack || "",
    price: typeof hit?.price === "number" ? hit.price : null,
  };
}

async function listFieldNames(tableId) {
  const fields = await baserow(`/api/database/fields/table/${tableId}/`);
  return new Set((fields || []).map((field) => field.name));
}

function leftoverUrls(row) {
  const dedicated = String(row["Supplier links"] || "");
  const notes = String(row.Notes || "");
  return mergeLinks(
    dedicated.split(/\r?\n/),
    looksLikeOnlyUrls(notes) ? notes.split(/\r?\n/) : [],
  );
}

async function findOrCreateSupplier(byName, hint) {
  const name = String(hint?.name || "").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  const hit = byName.get(key);
  if (hit) {
    const website = String(hit.Website || "").trim();
    if (!dryRun && hint.website && !website) {
      const updated = await baserow(
        `/api/database/rows/table/${suppliersTableId}/${hit.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify({ Website: hint.website }) },
      );
      byName.set(key, updated);
      return updated;
    }
    return hit;
  }
  if (dryRun) {
    const fake = { id: `dry:${key}`, Name: name, Website: hint.website || "" };
    byName.set(key, fake);
    return fake;
  }
  const created = await baserow(
    `/api/database/rows/table/${suppliersTableId}/?user_field_names=true`,
    {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        Website: hint.website || "",
        Notes: "",
      }),
    },
  );
  byName.set(key, created);
  return created;
}

async function fetchHillsMeta(url, { keepZero = false } = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; GwendaOps/1.0; +https://gwenda.co.uk)",
      Accept: "text/html",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const html = await response.text();
  const abvMatch = html.match(ABV_RE);
  const sizeMatch = html.match(SIZE_RE);
  const netMatch = html.match(NET_PRICE_RE);
  const abv = abvMatch ? Number(abvMatch[1]) : null;
  const net = netMatch ? Number(netMatch[1]) : null;
  let abvOut = null;
  if (Number.isFinite(abv)) {
    if (abv > 0) abvOut = String(abv);
    else if (keepZero) abvOut = "0";
  }
  return {
    ok: true,
    abv: abvOut,
    size: sizeMatch?.[1]?.trim() || null,
    price:
      Number.isFinite(net) && net > 0 ? Math.round(net * 100) / 100 : null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectKind(value) {
  if (typeof value === "string") return value.trim().toLowerCase();
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim().toLowerCase();
  }
  return "";
}

function mergeLinks(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const url of group || []) {
      const key = parseProductUrl(url);
      if (!key) continue;
      const k = key.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(key);
    }
  }
  return out;
}

async function main() {
  console.log(dryRun ? "Dry run…\n" : "Enriching inventory from supplier pages…\n");

  const [inventoryRows, supplierRows, linkRows, linkFieldNames] = await Promise.all([
    listRows(inventoryTableId),
    listRows(suppliersTableId),
    listRows(inventorySuppliersTableId),
    listFieldNames(inventorySuppliersTableId),
  ]);
  if (!linkFieldNames.has("Price")) {
    console.log(
      "Note: Inventory suppliers has no Price column yet. Run npm run setup:baserow-ops.\n",
    );
  }
  const supplierByName = new Map(
    supplierRows.map((row) => [String(row.Name || "").trim().toLowerCase(), row]),
  );
  const linksByInventory = new Map();
  for (const row of linkRows) {
    const invId = String(linkId(row.Inventory) ?? "");
    if (!invId) continue;
    const list = linksByInventory.get(invId) ?? [];
    list.push(row);
    linksByInventory.set(invId, list);
  }

  const cache = new Map();
  let updated = 0;
  let skipped = 0;

  for (const row of inventoryRows) {
    const name = String(row.Name || "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }

    const kind = selectKind(row.Kind);
    const keepZero =
      KEEP_ZERO_ABV.has(kind) || /\bNA\b|\b0\.0%?\b/i.test(name);
    const mapped = SUPPLIER_LINKS[name] || [];
    const resolvedLinks = mergeLinks(leftoverUrls(row), mapped);
    let abv = null;

    const hillsByUrl = new Map();
    for (const url of resolvedLinks) {
      const cacheKey = `${url}|${keepZero ? "z" : "n"}`;
      if (!cache.has(cacheKey)) {
        try {
          const meta = await fetchHillsMeta(url, { keepZero });
          cache.set(cacheKey, meta);
          await sleep(350);
        } catch (error) {
          cache.set(cacheKey, { ok: false, error: String(error.message || error) });
        }
      }
      const meta = cache.get(cacheKey);
      hillsByUrl.set(url, meta);
      if (meta?.ok && meta.abv != null && abv == null) abv = meta.abv;
    }

    const existing = linksByInventory.get(String(row.id)) || [];
    const existingByUrl = new Map(
      existing.map((link) => [
        parseProductUrl(link["Product URL"]).toLowerCase(),
        link,
      ]),
    );

    let linksChanged = 0;
    for (const url of resolvedLinks) {
      const lwc = lwcForUrl(url);
      const hills = hillsByUrl.get(url);
      const price = lwc.price ?? hills?.price ?? null;
      const pack = lwc.pack || hills?.size || "";
      const hint =
        lwc.price != null
          ? {
              name: "LWC Drinks",
              website: "https://www.lwc-drinks.co.uk",
              productUrl: url,
            }
          : supplierFromUrl(url);
      const supplier = await findOrCreateSupplier(supplierByName, hint);
      if (!supplier) continue;
      const payload = {
        Name: String(supplier.Name || hint.name || "").trim(),
        Inventory: [Number(row.id)],
        Supplier: [Number(supplier.id)],
        "Product URL": url,
      };
      if (linkFieldNames.has("SKU")) payload.SKU = lwc.sku;
      if (linkFieldNames.has("Pack") && pack) payload.Pack = pack;
      if (linkFieldNames.has("Price") && price != null) payload.Price = price;

      const current = existingByUrl.get(url.toLowerCase());
      const samePrice =
        !linkFieldNames.has("Price") ||
        Number(current?.Price) === Number(price ?? current?.Price);
      const sameSku =
        !linkFieldNames.has("SKU") ||
        String(current?.SKU || "") === String(lwc.sku || "");
      const samePack =
        !linkFieldNames.has("Pack") ||
        String(current?.Pack || "") === String(pack || current?.Pack || "");
      const sameSupplier =
        current && String(linkId(current.Supplier) ?? "") === String(supplier.id);

      if (current && samePrice && sameSku && samePack && sameSupplier) continue;

      if (!dryRun && !String(supplier.id).startsWith("dry:")) {
        if (current) {
          const patched = await baserow(
            `/api/database/rows/table/${inventorySuppliersTableId}/${current.id}/?user_field_names=true`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );
          existingByUrl.set(url.toLowerCase(), patched);
        } else {
          const created = await baserow(
            `/api/database/rows/table/${inventorySuppliersTableId}/?user_field_names=true`,
            { method: "POST", body: JSON.stringify(payload) },
          );
          existing.push(created);
          existingByUrl.set(url.toLowerCase(), created);
          linksByInventory.set(String(row.id), existing);
        }
      }
      linksChanged += 1;
    }

    const prevAbv = String(row.ABV || "").trim();
    const prevNotes = String(row.Notes || "").trim();
    const clearNotes = looksLikeOnlyUrls(prevNotes) && Boolean(prevNotes);
    const sameAbv = abv == null || prevAbv === abv;

    if (sameAbv && !linksChanged && !clearNotes) {
      console.log(
        `  · ${name}${abv != null ? ` (${abv}%)` : mapped.length ? "" : " (no supplier URL)"}`,
      );
      skipped += 1;
      continue;
    }

    const fields = {};
    if (abv != null) fields.ABV = abv;
    if (clearNotes) fields.Notes = "";

    if (!dryRun && Object.keys(fields).length) {
      await baserow(
        `/api/database/rows/table/${inventoryTableId}/${row.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify(fields) },
      );
    }

    const abvLabel =
      abv != null
        ? `ABV ${abv}%${prevAbv && prevAbv !== abv ? ` (was ${prevAbv})` : ""}`
        : mapped.length
          ? "no ABV on page"
          : resolvedLinks.length
            ? "links kept"
            : "no supplier URL";
    console.log(
      `  ✓ ${name} · ${abvLabel} · ${resolvedLinks.length} link${resolvedLinks.length === 1 ? "" : "s"}`,
    );
    updated += 1;
  }

  console.log(
    `\n${dryRun ? "Dry run: would update" : "Updated"} ${updated} row(s); ${skipped} unchanged.`,
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
