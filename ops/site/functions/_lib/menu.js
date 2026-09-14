export const RECIPE_UNITS = [
  "ml",
  "cl",
  "dash",
  "barspoon",
  "drop",
  "splash",
  "each",
  "slice",
  "wedge",
  "sprig",
  "top",
  "pinch",
  "tsp",
  "tbsp",
];

const UNIT_ALIASES = {
  dashes: "dash",
  ds: "dash",
  barspoons: "barspoon",
  "bar spoon": "barspoon",
  "bar spoons": "barspoon",
  bsp: "barspoon",
  drops: "drop",
  splashes: "splash",
  slices: "slice",
  wedges: "wedge",
  sprigs: "sprig",
  pinch: "pinch",
  pinches: "pinch",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  oz: "ml",
};

const UNIT_PATTERN = RECIPE_UNITS.concat(Object.keys(UNIT_ALIASES))
  .sort((a, b) => b.length - a.length)
  .join("|");

const QTY_UNIT_NAME = new RegExp(
  `^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})\\s+(.+)$`,
  "i",
);
const NAME_QTY_UNIT = new RegExp(
  `^(.+?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PATTERN})$`,
  "i",
);

export function flattenIngredientsForMenu(ingredients) {
  if (!Array.isArray(ingredients)) return "";
  return ingredients
    .map((ing) => (typeof ing?.name === "string" ? ing.name.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

export function normalizeUnit(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const aliased = UNIT_ALIASES[trimmed] || trimmed;
  return RECIPE_UNITS.includes(aliased) ? aliased : "";
}

export function parseQuantity(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIngredientLine(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return null;

  const qtyFirst = raw.match(QTY_UNIT_NAME);
  if (qtyFirst) {
    return {
      quantity: Number(qtyFirst[1]),
      unit: normalizeUnit(qtyFirst[2]) || undefined,
      name: qtyFirst[3].trim(),
    };
  }

  const nameLast = raw.match(NAME_QTY_UNIT);
  if (nameLast) {
    return {
      quantity: Number(nameLast[2]),
      unit: normalizeUnit(nameLast[3]) || undefined,
      name: nameLast[1].trim(),
    };
  }

  return { name: raw };
}

export function ingredientsFromDescription(description) {
  if (typeof description !== "string" || !description.trim()) return [];
  return description
    .split(",")
    .map((part) => parseIngredientLine(part))
    .filter(Boolean);
}

export function normalizeIngredients(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const parsed = typeof row === "string" ? parseIngredientLine(row) : row;
      const name = typeof parsed?.name === "string" ? parsed.name.trim() : "";
      if (!name) return null;
      const quantity = parseQuantity(parsed.quantity);
      const unit = normalizeUnit(parsed.unit) || "";
      const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
      const order = parseQuantity(parsed.order);
      return {
        name,
        ...(quantity != null ? { quantity } : {}),
        ...(unit ? { unit } : {}),
        ...(note ? { note } : {}),
        ...(order != null ? { order } : {}),
        ...(parsed.id != null ? { id: parsed.id } : {}),
      };
    })
    .filter(Boolean);
}

export function applyDescriptionFromRecipe(fields, { lockDescription, ingredients }) {
  if (lockDescription) return fields;
  if (!Array.isArray(ingredients) || ingredients.length === 0) return fields;
  const line = flattenIngredientsForMenu(ingredients);
  if (line) fields.description = line;
  return fields;
}

function splitCsvRow(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === "\t") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers, names) {
  return headers.findIndex((header) => names.includes(header));
}

export function parseImportText(text) {
  const raw = typeof text === "string" ? text.replace(/^\uFEFF/, "") : "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const headerCells = splitCsvRow(lines[0]).map((cell) => cell.toLowerCase());
  const cocktailIdx = headerIndex(headerCells, [
    "cocktail",
    "drink",
    "recipe",
    "name",
    "menu item",
    "item",
  ]);
  const ingredientIdx = headerIndex(headerCells, ["ingredient", "ingredients", "product"]);
  const qtyIdx = headerIndex(headerCells, ["qty", "quantity", "amount"]);
  const unitIdx = headerIndex(headerCells, ["unit", "uom"]);
  const noteIdx = headerIndex(headerCells, ["note", "notes"]);

  const hasHeader = cocktailIdx >= 0 && ingredientIdx >= 0;
  const start = hasHeader ? 1 : 0;
  const rows = [];

  for (const line of lines.slice(start)) {
    const cells = splitCsvRow(line);
    if (hasHeader) {
      const cocktail = cells[cocktailIdx] || "";
      const ingredient = cells[ingredientIdx] || "";
      if (!cocktail && !ingredient) continue;
      rows.push({
        cocktail: cocktail.trim(),
        name: ingredient.trim(),
        quantity: qtyIdx >= 0 ? parseQuantity(cells[qtyIdx]) : null,
        unit: unitIdx >= 0 ? normalizeUnit(cells[unitIdx]) : "",
        note: noteIdx >= 0 ? (cells[noteIdx] || "").trim() : "",
      });
      continue;
    }

    if (cells.length >= 3) {
      rows.push({
        cocktail: cells[0],
        quantity: parseQuantity(cells[1]),
        unit: normalizeUnit(cells[2]),
        name: cells.slice(3).join(" ").trim() || cells[2],
        note: "",
      });
      continue;
    }

    if (cells.length === 2) {
      const parsed = parseIngredientLine(cells[1]);
      if (!parsed) continue;
      rows.push({
        cocktail: cells[0],
        ...parsed,
        note: "",
      });
    }
  }

  return rows.filter((row) => row.cocktail && row.name);
}

export function groupImportRows(rows) {
  const byCocktail = new Map();
  for (const row of rows) {
    const key = row.cocktail.trim();
    if (!key) continue;
    const list = byCocktail.get(key) ?? [];
    list.push(row);
    byCocktail.set(key, list);
  }
  return byCocktail;
}

export function deployTargetForEnv(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "production" ? "production" : "staging";
}
