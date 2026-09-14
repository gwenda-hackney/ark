import {
  boolField,
  createRow,
  deleteRow,
  fileUrl,
  getRow,
  linkIds,
  linkValue,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
  uploadUserFile,
} from "./baserow.js";
import {
  applyDescriptionFromRecipe,
  flattenIngredientsForMenu,
  normalizeIngredients,
  normalizeUnit,
  parseQuantity,
} from "./menu.js";

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function unitFromBaserow(value) {
  if (typeof value === "string") return normalizeUnit(value);
  if (value && typeof value === "object" && typeof value.value === "string") {
    return normalizeUnit(value.value);
  }
  return "";
}

function mapIngredient(row) {
  return {
    id: row.id,
    name: text(row.Name),
    quantity: parseQuantity(row.Qty),
    unit: unitFromBaserow(row.Unit),
    note: text(row.Note),
    order: parseQuantity(row.Order) ?? 0,
    itemId: linkValue(row["Menu Item"]),
  };
}

function mapSection(row) {
  return {
    _id: String(row.id),
    id: String(row.id),
    title: text(row.Name),
    slug: text(row.Slug),
    subtitle: text(row.Subtitle) || undefined,
    orderRank: parseQuantity(row.Order) ?? 0,
    parentId: linkValue(row.Parent) != null ? String(linkValue(row.Parent)) : null,
    parentTitle: undefined,
    sanityId: text(row["Sanity ID"]) || undefined,
    items: [],
  };
}

function mapItem(row) {
  const photo = fileUrl(row.Photo);
  return {
    _id: String(row.id),
    id: String(row.id),
    name: text(row.Name),
    description: text(row["Menu line"]) || undefined,
    lockDescription: boolField(row["Lock menu line"]),
    price: text(row.Price) || undefined,
    notes: text(row.Type) || undefined,
    glassware: text(row.Glassware) || undefined,
    garnish: text(row.Garnish) || undefined,
    ice: text(row.Ice) || undefined,
    method: text(row.Method) || undefined,
    signature: boolField(row.Signature),
    abv: text(row.ABV) || undefined,
    volume: text(row.Volume) || undefined,
    producer: text(row.Producer) || undefined,
    orderRank: parseQuantity(row.Order) ?? 0,
    sectionId: linkValue(row.Section) != null ? String(linkValue(row.Section)) : null,
    sanityId: text(row["Sanity ID"]) || undefined,
    onDigitalMenu: row["On digital menu"] == null ? true : boolField(row["On digital menu"]),
    image: photo
      ? {
          alt: text(row.Name),
          asset: { url: photo },
        }
      : undefined,
    ingredients: [],
  };
}

export async function loadMenuTree(env) {
  const tables = await resolveOpsTableIds(env);
  const [sectionRows, itemRows, ingredientRows] = await Promise.all([
    listAllRows(env, tables.sections),
    listAllRows(env, tables.items),
    listAllRows(env, tables.ingredients),
  ]);

  const sections = sectionRows.map(mapSection).sort((a, b) => a.orderRank - b.orderRank);
  const byId = new Map(sections.map((section) => [section._id, section]));
  for (const section of sections) {
    if (section.parentId && byId.has(section.parentId)) {
      section.parentTitle = byId.get(section.parentId).title;
    }
  }

  const ingredientsByItem = new Map();
  for (const row of ingredientRows) {
    const ing = mapIngredient(row);
    if (!ing.itemId) continue;
    const key = String(ing.itemId);
    const list = ingredientsByItem.get(key) ?? [];
    list.push(ing);
    ingredientsByItem.set(key, list);
  }
  for (const list of ingredientsByItem.values()) {
    list.sort((a, b) => a.order - b.order || a.id - b.id);
  }

  const items = itemRows.map(mapItem).sort((a, b) => a.orderRank - b.orderRank);
  for (const item of items) {
    item.ingredients = ingredientsByItem.get(item._id) || [];
    const section = item.sectionId ? byId.get(item.sectionId) : null;
    if (section) {
      section.items.push(item);
      item.section = {
        _id: section._id,
        title: section.title,
        parentTitle: section.parentTitle,
      };
    }
  }

  return { tables, sections, items };
}

function itemFieldsFromInput(input, { ingredients }) {
  const name = text(input.name);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const sectionId = Number(input.sectionId);
  if (!Number.isFinite(sectionId)) {
    const error = new Error("Section is required.");
    error.status = 400;
    throw error;
  }

  const lockDescription = input.lockDescription === true || input.lockDescription === "true";
  const fields = {
    description: text(input.description) || undefined,
  };
  applyDescriptionFromRecipe(fields, { lockDescription, ingredients });

  return {
    Name: name,
    Section: [sectionId],
    "Menu line": fields.description || "",
    "Lock menu line": lockDescription,
    Price: text(input.price),
    Type: text(input.notes),
    Glassware: text(input.glassware),
    Garnish: text(input.garnish),
    Ice: text(input.ice),
    Method: text(input.method),
    Signature: input.signature === true || input.signature === "true",
    ABV: text(input.abv),
    Volume: text(input.volume),
    Producer: text(input.producer),
    Order: parseQuantity(input.orderRank) ?? 0,
    "On digital menu":
      input.onDigitalMenu == null
        ? true
        : input.onDigitalMenu === true || input.onDigitalMenu === "true",
    ...(text(input.sanityId) ? { "Sanity ID": text(input.sanityId) } : {}),
  };
}

async function replaceIngredients(env, tables, itemId, ingredients) {
  const existing = await listAllRows(env, tables.ingredients);
  const mine = existing.filter((row) => linkIds(row["Menu Item"]).includes(Number(itemId)));
  await Promise.all(mine.map((row) => deleteRow(env, tables.ingredients, row.id)));

  const normalized = normalizeIngredients(ingredients);
  const created = [];
  for (const [index, ing] of normalized.entries()) {
    const row = await createRow(env, tables.ingredients, {
      Name: ing.name,
      "Menu Item": [Number(itemId)],
      Qty: ing.quantity ?? null,
      Unit: ing.unit || null,
      Note: ing.note || "",
      Order: ing.order ?? index + 1,
    });
    created.push(mapIngredient(row));
  }
  return created;
}

export async function createMenuItem(env, input) {
  const tables = await resolveOpsTableIds(env);
  const ingredients = normalizeIngredients(input.ingredients);
  const fields = itemFieldsFromInput(input, { ingredients });
  if (!fields.Order) {
    const siblings = await listAllRows(env, tables.items);
    const maxOrder = siblings.reduce((max, row) => {
      const order = parseQuantity(row.Order) ?? 0;
      return order > max ? order : max;
    }, 0);
    fields.Order = maxOrder + 1;
  }
  const row = await createRow(env, tables.items, fields);
  const savedIngredients = await replaceIngredients(env, tables, row.id, ingredients);
  const item = mapItem(row);
  item.ingredients = savedIngredients;
  item.sectionId = String(linkValue(row.Section) ?? input.sectionId);
  return item;
}

export async function updateMenuItem(env, itemId, input) {
  const tables = await resolveOpsTableIds(env);
  const existing = await getRow(env, tables.items, itemId);
  if (!existing?.id) {
    const error = new Error("Item not found.");
    error.status = 404;
    throw error;
  }
  const ingredients = normalizeIngredients(input.ingredients);
  const fields = itemFieldsFromInput(
    {
      ...input,
      sectionId: input.sectionId || linkValue(existing.Section),
    },
    { ingredients },
  );
  const row = await updateRow(env, tables.items, itemId, fields);
  const savedIngredients = await replaceIngredients(env, tables, itemId, ingredients);
  const item = mapItem(row);
  item.ingredients = savedIngredients;
  item.sectionId = String(linkValue(row.Section) ?? input.sectionId);
  return item;
}

export async function deleteMenuItem(env, itemId) {
  const tables = await resolveOpsTableIds(env);
  const existing = await listAllRows(env, tables.ingredients);
  const mine = existing.filter((row) => linkIds(row["Menu Item"]).includes(Number(itemId)));
  await Promise.all(mine.map((row) => deleteRow(env, tables.ingredients, row.id)));
  await deleteRow(env, tables.items, itemId);
  return { id: String(itemId) };
}

export async function setMenuItemPhoto(env, itemId, bytes, { filename, contentType, alt }) {
  const tables = await resolveOpsTableIds(env);
  const uploaded = await uploadUserFile(env, bytes, { filename, contentType });
  const row = await updateRow(env, tables.items, itemId, {
    Photo: [{ name: uploaded.name }],
    ...(alt ? {} : {}),
  });
  return mapItem(row);
}

export async function importIngredientsForItems(env, rows) {
  const { items, tables } = await loadMenuTree(env);
  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));
  const grouped = new Map();
  for (const row of rows) {
    const key = row.cocktail.trim();
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const matched = [];
  const unmatched = [];
  for (const [cocktail, ingredientRows] of grouped) {
    const existing = byName.get(cocktail.toLowerCase());
    if (!existing) {
      unmatched.push(cocktail);
      continue;
    }
    const ingredients = normalizeIngredients(ingredientRows);
    await replaceIngredients(env, tables, existing._id, ingredients);
    const lockDescription = existing.lockDescription === true;
    if (!lockDescription) {
      const line = flattenIngredientsForMenu(ingredients);
      if (line) {
        await updateRow(env, tables.items, existing._id, { "Menu line": line });
      }
    }
    matched.push({ id: existing._id, name: existing.name, count: ingredients.length });
  }
  return { matched, unmatched };
}
