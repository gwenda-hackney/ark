#!/usr/bin/env node
/**
 * Seed Baserow Ops inventory + recipes from the print menu and bar ingredients sheet.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-ops-print-menu.mjs
 *   node --env-file=.env scripts/seed-ops-print-menu.mjs --dry-run
 */
import { PRINT_MENU_CHAPTERS, PRINT_MENU_SECTION_SLUGS } from "./lib/print-menu-sections.mjs";
import { requireOpsTables } from "./lib/ops-baserow-tables.mjs";

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
let sectionsTableId = "";
let itemsTableId = "";
let ingredientsTableId = "";
let inventoryTableId = "";
const dryRun = process.argv.includes("--dry-run");

if (!apiKey) {
  console.error("Need BASEROW_API_KEY");
  process.exit(1);
}

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

function linkId(field) {
  if (Array.isArray(field) && field[0] != null) {
    return typeof field[0] === "object" ? field[0].id : field[0];
  }
  return null;
}

// ── Inventory catalog (shared stock) ─────────────────────────────────────────

const INVENTORY = [
  // Liquor
  { name: "Roku Gin", kind: "liquor", defaultUnit: "ml", abv: "43", estimatedCost: 25 },
  { name: "Arboretum Gin", kind: "liquor", defaultUnit: "ml" },
  { name: "Arboretum Pink Gin", kind: "liquor", defaultUnit: "ml", abv: "37.5", estimatedCost: 14.31 },
  { name: "Renegade Gin", kind: "liquor", defaultUnit: "ml" },
  { name: "42 Below Vodka", kind: "liquor", defaultUnit: "ml" },
  { name: "Moonshine Vodka", kind: "liquor", defaultUnit: "ml" },
  { name: "Moonshine Vanilla Vodka", kind: "liquor", defaultUnit: "ml", abv: "37.5", estimatedCost: 14.5 },
  { name: "AU Vodka", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 22.9 },
  { name: "Buen Amigo Silver Tequila", kind: "liquor", defaultUnit: "ml" },
  { name: "Rooster Rojo Blanco Tequila", kind: "liquor", defaultUnit: "ml", abv: "38", estimatedCost: 21.1 },
  { name: "Bandero Premium Blanco", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 40.12 },
  { name: "Cazadores Reposado Tequila", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 30.12 },
  { name: "Astral Tequila Blanco", kind: "liquor", defaultUnit: "ml", abv: "38", estimatedCost: 28.99 },
  { name: "Ilegal Joven Mezcal", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 48.9 },
  { name: "Ojo de Dios Mezcal Joven", kind: "liquor", defaultUnit: "ml", abv: "42", estimatedCost: 38.75 },
  { name: "Appleton Estate Signature Rum", kind: "liquor", defaultUnit: "ml" },
  { name: "Juan de la Costa White Rum", kind: "liquor", defaultUnit: "ml", abv: "37.5", estimatedCost: 14.54 },
  { name: "Juan de la Costa Dark Rum", kind: "liquor", defaultUnit: "ml", abv: "37.5", estimatedCost: 15.51 },
  { name: "Juan de la Costa Spiced Rum", kind: "liquor", defaultUnit: "ml" },
  { name: "Admiral's Old J Spiced Rum", kind: "liquor", defaultUnit: "ml", abv: "35", estimatedCost: 19.99 },
  { name: "El Dorado 12 Year Old Rum", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 50.35 },
  { name: "Admiral's Old J Tiki Fire Spiced Rum", kind: "liquor", defaultUnit: "ml", abv: "35", estimatedCost: 37.94 },
  { name: "Bacardi Reserva Ocho Rum", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 38.31 },
  { name: "Iron Wheel Kentucky Bourbon", kind: "liquor", defaultUnit: "ml" },
  { name: "Jameson Black Barrel", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 40.89 },
  { name: "Jameson Irish Whiskey", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 55.95 },
  { name: "Slane Irish Whiskey", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 27.95 },
  { name: "Maker's Mark 46", kind: "liquor", defaultUnit: "ml", abv: "47", estimatedCost: 44.55 },
  { name: "Laphroaig 10 Year Old Whisky", kind: "liquor", defaultUnit: "ml", abv: "40", estimatedCost: 56.2 },
  { name: "Pernod Absinthe Supérieure", kind: "liquor", defaultUnit: "ml", abv: "68", estimatedCost: 51.33 },
  { name: "Vecchia Romagna Etichetta Nera", kind: "liquor", defaultUnit: "ml" },
  { name: "Grappa Diciotto Lune", kind: "liquor", defaultUnit: "ml" },
  { name: "Grappa Nardini Bianca", kind: "liquor", defaultUnit: "ml" },
  // Liqueurs / aperitifs
  { name: "Italicus", fullName: "Italicus bergamot liqueur", kind: "liqueur", defaultUnit: "ml" },
  { name: "St-Germain", fullName: "St-Germain elderflower liqueur", kind: "liqueur", defaultUnit: "ml" },
  { name: "Campari", kind: "liqueur", defaultUnit: "ml" },
  { name: "Aperol", kind: "liqueur", defaultUnit: "ml" },
  { name: "Amaro Montenegro", kind: "liqueur", defaultUnit: "ml", abv: "23", estimatedCost: 29.08 },
  { name: "Paixão Coffee", kind: "liqueur", defaultUnit: "ml", abv: "17", estimatedCost: 11.05 },
  { name: "Amaro Lucano", kind: "liqueur", defaultUnit: "ml" },
  { name: "Vecchio Amaro del Capo", kind: "liqueur", defaultUnit: "ml" },
  { name: "Martini Riserva Speciale Bitter", kind: "liqueur", defaultUnit: "ml" },
  { name: "Martini Rosso", kind: "liqueur", defaultUnit: "ml" },
  { name: "Borghetti", fullName: "Borghetti coffee liqueur", kind: "liqueur", defaultUnit: "ml" },
  { name: "Disaronno", fullName: "Disaronno amaretto", kind: "liqueur", defaultUnit: "ml" },
  { name: "Giffard Triple Sec", kind: "liqueur", defaultUnit: "ml" },
  { name: "Monin Blue Curaçao", kind: "liqueur", defaultUnit: "ml" },
  { name: "Corky's Sour Cherry Schnapps", kind: "liqueur", defaultUnit: "ml" },
  { name: "Narano Bitter Orange", kind: "liqueur", defaultUnit: "ml" },
  { name: "Sambuca Molinari", kind: "liqueur", defaultUnit: "ml" },
  { name: "Mirto Rosso", kind: "liqueur", defaultUnit: "ml" },
  { name: "Spinello", kind: "liqueur", defaultUnit: "ml", matchNames: ["Spinello Spritz"] },
  { name: "Limoncello", kind: "liqueur", defaultUnit: "ml" },
  // Bitters
  { name: "Angostura Bitters", kind: "bitter", defaultUnit: "dash" },
  // Syrups
  { name: "Sugar syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 3 },
  { name: "Maple syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 5 },
  { name: "Banana syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Tonka syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Fig syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Strawberry syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Mint syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Grenadine", kind: "syrup", defaultUnit: "ml", estimatedCost: 4 },
  { name: "Agave syrup", kind: "syrup", defaultUnit: "ml", estimatedCost: 5 },
  // Juices
  { name: "Lime juice", kind: "juice", defaultUnit: "ml", estimatedCost: 8 },
  { name: "Lemon juice", kind: "juice", defaultUnit: "ml", estimatedCost: 8 },
  { name: "Grapefruit juice", kind: "juice", defaultUnit: "ml", estimatedCost: 5 },
  { name: "Apple juice", kind: "juice", defaultUnit: "ml", estimatedCost: 2.5 },
  { name: "Pineapple juice", kind: "juice", defaultUnit: "ml", estimatedCost: 2.5 },
  { name: "Orange juice", kind: "juice", defaultUnit: "ml", estimatedCost: 2.5 },
  { name: "Pomegranate juice", kind: "juice", defaultUnit: "ml", estimatedCost: 4 },
  { name: "Passion fruit puree", kind: "juice", defaultUnit: "ml", estimatedCost: 6 },
  { name: "Coconut water", kind: "juice", defaultUnit: "ml", estimatedCost: 2 },
  { name: "Cucumber juice", kind: "juice", defaultUnit: "ml", estimatedCost: 6 },
  // Mixers
  { name: "Soda water", kind: "mixer", defaultUnit: "ml" },
  { name: "Tonic water", kind: "mixer", defaultUnit: "ml" },
  { name: "Coca-Cola", kind: "mixer", defaultUnit: "ml" },
  { name: "Lemon soda", kind: "mixer", defaultUnit: "ml" },
  { name: "Monster Energy Drink", kind: "mixer", defaultUnit: "ml" },
  { name: "Ginger beer", kind: "mixer", defaultUnit: "ml" },
  { name: "Prosecco", kind: "wine", defaultUnit: "ml" },
  { name: "Terre Forti Sangiovese", kind: "wine", defaultUnit: "ml", abv: "12.5" },
  // Beer
  { name: "Menabrea Bionda Lager", kind: "beer", defaultUnit: "each" },
  { name: "Baladin Nazionale Blonde Ale", kind: "beer", defaultUnit: "each" },
  { name: "Baladin Botanic Blonde NA", kind: "beer", defaultUnit: "each" },
  { name: "Gwenda Pilsner", kind: "beer", defaultUnit: "ml" },
  { name: "Tiny Rebel IPA", kind: "beer", defaultUnit: "ml" },
  { name: "Caffrey's Black Stout", kind: "beer", defaultUnit: "ml" },
  // Garnish / other
  { name: "Fresh basil", kind: "garnish", defaultUnit: "sprig", estimatedCost: 0.15 },
  { name: "Fresh mint", kind: "garnish", defaultUnit: "sprig", estimatedCost: 0.15 },
  { name: "Sea salt", kind: "other", defaultUnit: "pinch", estimatedCost: 0.01 },
  { name: "Salt", kind: "other", defaultUnit: "pinch", estimatedCost: 0.01 },
  { name: "Chilli powder", kind: "other", defaultUnit: "pinch", estimatedCost: 0.01 },
  { name: "Cinnamon", kind: "other", defaultUnit: "pinch", estimatedCost: 0.01 },
  { name: "Saline solution", kind: "other", defaultUnit: "drop" },
  { name: "Aquafaba", kind: "other", defaultUnit: "ml", estimatedCost: 2 },
  { name: "Egg white", kind: "other", defaultUnit: "ml", estimatedCost: 7 },
];

function inv(name, quantity, unit) {
  return { name, quantity, unit, inventoryName: name };
}

const COCKTAIL_TYPES = new Set([
  "spritz",
  "highball",
  "sour",
  "stirred",
  "negroni",
  "fizz",
  "other",
]);

function cocktailTypeFor(def) {
  const explicit = String(def.cocktailType || "")
    .trim()
    .toLowerCase();
  if (COCKTAIL_TYPES.has(explicit)) return explicit;
  const fromSection = String(def.sectionSlug || "")
    .trim()
    .toLowerCase();
  return COCKTAIL_TYPES.has(fromSection) ? fromSection : "";
}

/** UK pint. Half pint is costed at half of this serve. */
const UK_PINT_ML = 568;

// ── Menu definitions (print + PDF recipes) ───────────────────────────────────

/** @type {Array<{
 *  matchNames: string[],
 *  name: string,
 *  sectionSlug: string,
 *  price?: string,
 *  priceAlt?: string,
 *  drinkType: string,
 *  cocktailType?: string,
 *  notes?: string,
 *  description?: string,
 *  lockDescription?: boolean,
 *  abv?: string,
 *  volume?: string,
 *  producer?: string,
 *  onDigitalMenu?: boolean,
 *  ingredients?: Array<{name:string,quantity?:number,unit?:string,inventoryName?:string}>,
 *  order?: number,
 *  delete?: boolean,
 * }>} */
const MENU_UPDATES = [
  // ── Our Formulas ──
  {
    matchNames: ["Gwenda"],
    name: "Gwenda",
    sectionSlug: "our-formulas",
    price: "13",
    drinkType: "cocktail",
    cocktailType: "fizz",
    notes: "Floral fizz",
    description: "Roku gin, Italicus, elderflower liqueur, lime, soda, basil",
    lockDescription: true,
    ingredients: [
      inv("Roku Gin", 40, "ml"),
      inv("Italicus", 15, "ml"),
      inv("St-Germain", 10, "ml"),
      inv("Lime juice", 20, "ml"),
      inv("Soda water", 50, "ml"),
      inv("Fresh basil", 1, "sprig"),
    ],
  },
  {
    matchNames: ["The Wick", "Wick"],
    name: "The Wick",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "fizz",
    notes: "Cool coconut",
    description: "Finlandia vodka, coconut water, blue curaçao, lime, soda",
    lockDescription: true,
    ingredients: [
      inv("42 Below Vodka", 40, "ml"),
      inv("Coconut water", 60, "ml"),
      inv("Monin Blue Curaçao", 15, "ml"),
      inv("Lime juice", 15, "ml"),
      inv("Soda water", 50, "ml"),
    ],
  },
  {
    matchNames: ["Ponente"],
    name: "Ponente",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Bitter lemon",
    description: "Campari, Arboretum gin, Amaro Montenegro, cherry, lemon",
    lockDescription: true,
    ingredients: [
      inv("Campari", 45, "ml"),
      inv("Arboretum Gin", 25, "ml"),
      inv("Amaro Montenegro", 15, "ml"),
      inv("Corky's Sour Cherry Schnapps", 15, "ml"),
      inv("Lemon juice", 15, "ml"),
    ],
  },
  {
    matchNames: ["Tramontana"],
    name: "Tramontana",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Salty cherry",
    description: "42 Below vodka, Martini Riserva Speciale Bitter, cherry, saline, lemon",
    lockDescription: true,
    ingredients: [
      inv("42 Below Vodka", 45, "ml"),
      inv("Martini Riserva Speciale Bitter", 15, "ml"),
      inv("Corky's Sour Cherry Schnapps", 15, "ml"),
      inv("Saline solution", 2, "drop"),
      inv("Lemon juice", 15, "ml"),
    ],
  },
  {
    matchNames: ["Maestrale"],
    name: "Maestrale",
    sectionSlug: "our-formulas",
    price: "10",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Salted grapefruit",
    description: "Buen Amigo Silver tequila, grapefruit, lime, agave, sea salt",
    lockDescription: true,
    ingredients: [
      inv("Buen Amigo Silver Tequila", 40, "ml"),
      inv("Grapefruit juice", 25, "ml"),
      inv("Lime juice", 15, "ml"),
      inv("Agave syrup", 10, "ml"),
      inv("Sea salt", 1, "pinch"),
    ],
  },
  {
    matchNames: ["Aurelia", "Porco Dio"],
    name: "Aurelia",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Cucumber and pineapple",
    description: "Renegade gin, cucumber, pineapple, lemon, sugar syrup",
    lockDescription: true,
    ingredients: [
      inv("Renegade Gin", 50, "ml"),
      inv("Cucumber juice", 20, "ml"),
      inv("Pineapple juice", 25, "ml"),
      inv("Lemon juice", 15, "ml"),
      inv("Sugar syrup", 7.5, "ml"),
    ],
  },
  {
    matchNames: ["Paradise Lost", "Iron Hook"],
    name: "Paradise Lost",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Smoky passion fruit",
    description: "Ojo de Dios mezcal, passion fruit, lime, agave",
    lockDescription: true,
    ingredients: [
      inv("Ojo de Dios Mezcal Joven", 40, "ml"),
      inv("Passion fruit puree", 25, "ml"),
      inv("Lime juice", 15, "ml"),
      inv("Agave syrup", 10, "ml"),
    ],
  },
  {
    matchNames: ["Barbarossa", "Pirates Blood"],
    name: "Barbarossa",
    sectionSlug: "our-formulas",
    price: "12",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Smoke, strawberry, chilli",
    description: "Ojo de Dios mezcal, strawberry syrup, chilli powder, lime, red wine",
    lockDescription: true,
    ingredients: [
      inv("Ojo de Dios Mezcal Joven", 45, "ml"),
      inv("Strawberry syrup", 20, "ml"),
      inv("Chilli powder", 1, "pinch"),
      inv("Lime juice", 15, "ml"),
      inv("Terre Forti Sangiovese", 20, "ml"),
    ],
  },
  {
    matchNames: ["Ambra"],
    name: "Ambra",
    sectionSlug: "our-formulas",
    price: "11",
    drinkType: "cocktail",
    cocktailType: "sour",
    notes: "Banana and tonka",
    description: "Vecchia Romagna Etichetta Nera, banana syrup, tonka syrup, lemon, orange bitters",
    lockDescription: true,
    ingredients: [
      inv("Vecchia Romagna Etichetta Nera", 40, "ml"),
      inv("Banana syrup", 15, "ml"),
      inv("Tonka syrup", 10, "ml"),
      inv("Lemon juice", 20, "ml"),
      inv("Narano Bitter Orange", 2, "dash"),
    ],
  },
  {
    matchNames: ["Scirocco"],
    name: "Scirocco",
    sectionSlug: "our-formulas",
    price: "10",
    drinkType: "cocktail",
    cocktailType: "stirred",
    notes: "Fig and cinnamon",
    description: "Iron Wheel Kentucky bourbon, fig syrup, cinnamon, orange bitters",
    lockDescription: true,
    ingredients: [
      inv("Iron Wheel Kentucky Bourbon", 45, "ml"),
      inv("Fig syrup", 15, "ml"),
      inv("Cinnamon", 1, "pinch"),
      inv("Narano Bitter Orange", 2, "dash"),
    ],
  },
  {
    matchNames: ["Kraken"],
    name: "Kraken",
    sectionSlug: "our-formulas",
    price: "10",
    drinkType: "cocktail",
    cocktailType: "stirred",
    notes: "Coffee and maple",
    description: "Appleton Estate Signature Rum, Borghetti, maple syrup, Angostura",
    lockDescription: true,
    ingredients: [
      inv("Appleton Estate Signature Rum", 45, "ml"),
      inv("Borghetti", 15, "ml"),
      inv("Maple syrup", 5, "ml"),
      inv("Angostura Bitters", 2, "dash"),
    ],
  },

  // ── Free of Spirit ──
  {
    matchNames: ["Apple Mint Fizz"],
    name: "Apple Mint Fizz",
    sectionSlug: "free-of-spirit",
    price: "7",
    drinkType: "cocktail",
    cocktailType: "fizz",
    description: "Apple juice, mint syrup, lemon, soda",
    lockDescription: true,
    ingredients: [
      inv("Apple juice", 120, "ml"),
      inv("Mint syrup", 20, "ml"),
      inv("Lemon juice", 10, "ml"),
      inv("Soda water", 70, "ml"),
    ],
  },
  {
    matchNames: ["Tropical Punch"],
    name: "Tropical Punch",
    sectionSlug: "free-of-spirit",
    price: "7",
    drinkType: "cocktail",
    cocktailType: "fizz",
    description: "Pineapple juice, orange juice, lemon, soda",
    lockDescription: true,
    ingredients: [
      inv("Pineapple juice", 100, "ml"),
      inv("Orange juice", 80, "ml"),
      inv("Lemon juice", 10, "ml"),
      inv("Soda water", 80, "ml"),
    ],
  },
  {
    matchNames: ["Virgin Sunrise"],
    name: "Virgin Sunrise",
    sectionSlug: "free-of-spirit",
    price: "7",
    drinkType: "cocktail",
    cocktailType: "other",
    description: "Orange juice, grenadine, lemon",
    lockDescription: true,
    ingredients: [
      inv("Orange juice", 120, "ml"),
      inv("Grenadine", 20, "ml"),
      inv("Lemon juice", 10, "ml"),
    ],
  },
  {
    matchNames: ["Pomegranate Sparkler"],
    name: "Pomegranate Sparkler",
    sectionSlug: "free-of-spirit",
    price: "7",
    drinkType: "cocktail",
    cocktailType: "fizz",
    description: "Pomegranate juice, lemon, sugar syrup, soda",
    lockDescription: true,
    ingredients: [
      inv("Pomegranate juice", 120, "ml"),
      inv("Lemon juice", 10, "ml"),
      inv("Sugar syrup", 20, "ml"),
      inv("Soda water", 70, "ml"),
    ],
  },

  // ── Spritz ──
  {
    matchNames: ["Aperol Spritz"],
    name: "Aperol Spritz",
    sectionSlug: "spritz",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Aperol", 60, "ml"),
      inv("Prosecco", 90, "ml"),
      inv("Soda water", 30, "ml"),
    ],
  },
  {
    matchNames: ["Hugo Spritz"],
    name: "Hugo Spritz",
    sectionSlug: "spritz",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("St-Germain", 30, "ml"),
      inv("Prosecco", 90, "ml"),
      inv("Soda water", 30, "ml"),
      inv("Fresh mint", 1, "sprig"),
    ],
  },
  {
    matchNames: ["Limoncello Spritz"],
    name: "Limoncello Spritz",
    sectionSlug: "spritz",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("Limoncello", 50, "ml"),
      inv("Prosecco", 90, "ml"),
      inv("Soda water", 30, "ml"),
    ],
  },
  {
    matchNames: ["Spinello Spritz"],
    name: "Spinello Spritz",
    sectionSlug: "spritz",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Spinello", 80, "ml"),
      inv("Tonic water", 80, "ml"),
    ],
  },

  // ── Negroni ──
  {
    matchNames: ["Negroni"],
    name: "Negroni",
    sectionSlug: "negroni",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Arboretum Gin", 30, "ml"),
      inv("Campari", 30, "ml"),
      inv("Martini Rosso", 30, "ml"),
    ],
  },
  {
    matchNames: ["Mezcal Negroni"],
    name: "Mezcal Negroni",
    sectionSlug: "negroni",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("Ojo de Dios Mezcal Joven", 30, "ml"),
      inv("Campari", 30, "ml"),
      inv("Martini Rosso", 30, "ml"),
    ],
  },
  {
    matchNames: ["Negroni Sbagliato"],
    name: "Negroni Sbagliato",
    sectionSlug: "negroni",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Campari", 30, "ml"),
      inv("Martini Rosso", 30, "ml"),
      inv("Prosecco", 30, "ml"),
    ],
  },
  {
    matchNames: ["Boulevardier"],
    name: "Boulevardier",
    sectionSlug: "negroni",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("Iron Wheel Kentucky Bourbon", 30, "ml"),
      inv("Campari", 30, "ml"),
      inv("Martini Rosso", 30, "ml"),
    ],
  },

  // ── Sour ──
  {
    matchNames: ["Whiskey Sour"],
    name: "Whiskey Sour",
    sectionSlug: "sour",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("Jameson Irish Whiskey", 50, "ml"),
      inv("Lemon juice", 25, "ml"),
      inv("Sugar syrup", 15, "ml"),
      inv("Aquafaba", 20, "ml"),
      inv("Angostura Bitters", 2, "dash"),
    ],
  },
  {
    matchNames: ["Amaretto Sour"],
    name: "Amaretto Sour",
    sectionSlug: "sour",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Disaronno", 45, "ml"),
      inv("Lemon juice", 25, "ml"),
      inv("Maple syrup", 10, "ml"),
      inv("Aquafaba", 20, "ml"),
    ],
  },
  {
    matchNames: ["Margarita"],
    name: "Margarita",
    sectionSlug: "sour",
    price: "9",
    drinkType: "cocktail",
    ingredients: [
      inv("Buen Amigo Silver Tequila", 40, "ml"),
      inv("Giffard Triple Sec", 20, "ml"),
      inv("Lime juice", 20, "ml"),
      inv("Sugar syrup", 10, "ml"),
      inv("Salt", 1, "pinch"),
    ],
  },
  {
    matchNames: ["Spicy Margarita"],
    name: "Spicy Margarita",
    sectionSlug: "sour",
    price: "10",
    drinkType: "cocktail",
    ingredients: [
      inv("Buen Amigo Silver Tequila", 40, "ml"),
      inv("Giffard Triple Sec", 20, "ml"),
      inv("Lime juice", 20, "ml"),
      inv("Sugar syrup", 10, "ml"),
      inv("Chilli powder", 1, "pinch"),
      inv("Salt", 1, "pinch"),
    ],
  },

  // ── Highball (POS only · not on print or digital) ──
  {
    matchNames: ["Moscow Mule"],
    name: "Moscow Mule",
    sectionSlug: "highball",
    price: "10",
    drinkType: "cocktail",
    onDigitalMenu: false,
    onPrintMenu: false,
    ingredients: [
      inv("Moonshine Vodka", 50, "ml"),
      inv("Ginger beer", 120, "ml"),
      inv("Lime juice", 15, "ml"),
    ],
  },
  {
    matchNames: ["Gin and Tonic"],
    name: "Gin and Tonic",
    sectionSlug: "highball",
    price: "8",
    priceAlt: "10",
    drinkType: "cocktail",
    onDigitalMenu: false,
    onPrintMenu: false,
    description: "Arboretum gin, tonic. 25ml / 35ml",
    lockDescription: true,
    ingredients: [
      inv("Arboretum Gin", 25, "ml"),
      inv("Tonic water", 150, "ml"),
    ],
  },
  {
    matchNames: ["Rum and Coke"],
    name: "Rum and Coke",
    sectionSlug: "highball",
    price: "8",
    priceAlt: "10",
    drinkType: "cocktail",
    onDigitalMenu: false,
    onPrintMenu: false,
    description: "Juan de la Costa spiced rum, Coca-Cola. 25ml / 35ml",
    lockDescription: true,
    ingredients: [
      inv("Juan de la Costa Spiced Rum", 25, "ml"),
      inv("Coca-Cola", 150, "ml"),
    ],
  },
  {
    matchNames: ["Vodka Energy", "Vodka Red Bull"],
    name: "Vodka Energy",
    sectionSlug: "highball",
    price: "8",
    priceAlt: "10",
    drinkType: "cocktail",
    onDigitalMenu: false,
    onPrintMenu: false,
    description: "Moonshine vodka, Monster Energy. 25ml / 35ml",
    lockDescription: true,
    ingredients: [
      inv("Moonshine Vodka", 25, "ml"),
      inv("Monster Energy Drink", 150, "ml"),
    ],
  },
  {
    matchNames: ["Vodka Lemon"],
    name: "Vodka Lemon",
    sectionSlug: "highball",
    price: "8",
    priceAlt: "10",
    drinkType: "cocktail",
    onDigitalMenu: false,
    onPrintMenu: false,
    description: "Moonshine vodka, lemon soda. 25ml / 35ml",
    lockDescription: true,
    ingredients: [
      inv("Moonshine Vodka", 25, "ml"),
      inv("Lemon soda", 150, "ml"),
    ],
  },

  // ── Bottled beer ──
  {
    matchNames: ["Menabrea Bionda Lager", "Menabrea"],
    name: "Menabrea Bionda Lager",
    sectionSlug: "bottled-beer",
    price: "4",
    drinkType: "packaged",
    abv: "4.8",
    volume: "33cl",
    producer: "Menabrea",
    ingredients: [],
  },
  {
    matchNames: ["Baladin Nazionale Blonde Ale", "Nazionale"],
    name: "Baladin Nazionale Blonde Ale",
    sectionSlug: "bottled-beer",
    price: "6",
    drinkType: "packaged",
    abv: "6.5",
    volume: "33cl",
    producer: "Baladin",
    notes: "Gluten free",
    ingredients: [],
  },
  {
    matchNames: ["Baladin Botanic Blonde NA", "Botanic Blonde"],
    name: "Baladin Botanic Blonde NA",
    sectionSlug: "bottled-beer",
    price: "5.5",
    drinkType: "packaged",
    abv: "0.0",
    volume: "33cl",
    producer: "Baladin",
    ingredients: [],
  },

  // ── Draught beer ──
  {
    matchNames: ["Gwenda Pilsner"],
    name: "Gwenda Pilsner",
    sectionSlug: "draught-beer",
    price: "6.5",
    priceAlt: "3.5",
    drinkType: "beer",
    ingredients: [inv("Gwenda Pilsner", UK_PINT_ML, "ml")],
  },
  {
    matchNames: ["Tiny Rebel IPA", "Rebel IPA"],
    name: "Tiny Rebel IPA",
    sectionSlug: "draught-beer",
    price: "7",
    priceAlt: "4",
    drinkType: "beer",
    ingredients: [inv("Tiny Rebel IPA", UK_PINT_ML, "ml")],
  },
  {
    matchNames: ["Caffrey's Black Stout", "Caffreys Black Stout"],
    name: "Caffrey's Black Stout",
    sectionSlug: "draught-beer",
    price: "7.5",
    priceAlt: "4",
    drinkType: "beer",
    ingredients: [inv("Caffrey's Black Stout", UK_PINT_ML, "ml")],
  },

  // ── Cabinet pours ──
  {
    matchNames: ["Bandero Premium Blanco", "Bandero"],
    name: "Bandero Premium Blanco",
    sectionSlug: "agave",
    price: "7",
    drinkType: "pour",
    order: 1,
    ingredients: [inv("Bandero Premium Blanco", 25, "ml")],
  },
  {
    matchNames: ["Cazadores Reposado Tequila", "Cazadores Reposado"],
    name: "Cazadores Reposado Tequila",
    sectionSlug: "agave",
    price: "6",
    drinkType: "pour",
    order: 2,
    ingredients: [inv("Cazadores Reposado Tequila", 25, "ml")],
  },
  {
    matchNames: ["Astral Tequila Blanco", "Astral Blanco"],
    name: "Astral Tequila Blanco",
    sectionSlug: "agave",
    price: "5",
    drinkType: "pour",
    order: 3,
    ingredients: [inv("Astral Tequila Blanco", 25, "ml")],
  },
  {
    matchNames: ["Ilegal Joven Mezcal", "Ilegal Joven"],
    name: "Ilegal Joven Mezcal",
    sectionSlug: "agave",
    price: "7",
    drinkType: "pour",
    order: 4,
    ingredients: [inv("Ilegal Joven Mezcal", 25, "ml")],
  },
  {
    matchNames: ["Ojo de Dios Mezcal Joven", "Ojo de Dios"],
    name: "Ojo de Dios Mezcal Joven",
    sectionSlug: "agave",
    price: "6",
    drinkType: "pour",
    order: 5,
    ingredients: [inv("Ojo de Dios Mezcal Joven", 25, "ml")],
  },
  {
    matchNames: ["El Dorado 12 Year Old Rum", "El Dorado 12"],
    name: "El Dorado 12 Year Old Rum",
    sectionSlug: "rum",
    price: "8",
    drinkType: "pour",
    order: 1,
    ingredients: [inv("El Dorado 12 Year Old Rum", 25, "ml")],
  },
  {
    matchNames: [
      "Admiral's Old J Tiki Fire Spiced Rum",
      "Admiral's Old J Spiced Rum",
    ],
    name: "Admiral's Old J Tiki Fire Spiced Rum",
    sectionSlug: "rum",
    price: "5",
    drinkType: "pour",
    order: 2,
    ingredients: [inv("Admiral's Old J Tiki Fire Spiced Rum", 25, "ml")],
  },
  {
    matchNames: ["Bacardi Reserva Ocho Rum", "Bacardi Reserva Ocho"],
    name: "Bacardi Reserva Ocho Rum",
    sectionSlug: "rum",
    price: "6",
    drinkType: "pour",
    order: 3,
    ingredients: [inv("Bacardi Reserva Ocho Rum", 25, "ml")],
  },
  {
    matchNames: ["Jameson", "Jameson Black Barrel"],
    name: "Jameson Black Barrel",
    sectionSlug: "whiskey",
    price: "8",
    drinkType: "pour",
    onDigitalMenu: false,
    onPrintMenu: false,
    order: 1,
    ingredients: [inv("Jameson Black Barrel", 25, "ml")],
  },
  {
    matchNames: ["Slane Irish Whiskey", "Slane"],
    name: "Slane Irish Whiskey",
    sectionSlug: "whiskey",
    price: "6",
    drinkType: "pour",
    order: 2,
    ingredients: [inv("Slane Irish Whiskey", 25, "ml")],
  },
  {
    matchNames: ["Maker's Mark 46", "Makers Mark 46"],
    name: "Maker's Mark 46",
    sectionSlug: "whiskey",
    price: "7",
    drinkType: "pour",
    order: 3,
    ingredients: [inv("Maker's Mark 46", 25, "ml")],
  },
  {
    matchNames: ["Laphroaig 10 Year Old Whisky", "Laphroaig 10"],
    name: "Laphroaig 10 Year Old Whisky",
    sectionSlug: "whiskey",
    price: "8",
    drinkType: "pour",
    order: 4,
    ingredients: [inv("Laphroaig 10 Year Old Whisky", 25, "ml")],
  },
  {
    matchNames: ["Vecchio Amaro Del Capo", "Vecchio Amaro del Capo"],
    name: "Vecchio Amaro del Capo",
    sectionSlug: "amaro-digestivi",
    price: "5",
    drinkType: "pour",
    order: 1,
    ingredients: [inv("Vecchio Amaro del Capo", 25, "ml")],
  },
  {
    matchNames: ["Amaro Montenegro"],
    name: "Amaro Montenegro",
    sectionSlug: "amaro-digestivi",
    price: "6",
    drinkType: "pour",
    order: 2,
    ingredients: [inv("Amaro Montenegro", 25, "ml")],
  },
  {
    matchNames: ["Grappa Nardini Bianca"],
    name: "Grappa Nardini Bianca",
    sectionSlug: "amaro-digestivi",
    price: "5",
    drinkType: "pour",
    order: 3,
    ingredients: [inv("Grappa Nardini Bianca", 25, "ml")],
  },
  {
    matchNames: ["Grappa Diciotto Lune"],
    name: "Grappa Diciotto Lune",
    sectionSlug: "amaro-digestivi",
    price: "6",
    drinkType: "pour",
    order: 4,
    ingredients: [inv("Grappa Diciotto Lune", 25, "ml")],
  },
  {
    matchNames: ["Pernod Absinthe Supérieure", "Pernod Absinthe Superieure"],
    name: "Pernod Absinthe Supérieure",
    sectionSlug: "amaro-digestivi",
    price: "7",
    drinkType: "pour",
    order: 5,
    ingredients: [inv("Pernod Absinthe Supérieure", 25, "ml")],
  },

  // Remove obsolete Cabinet lines
  {
    matchNames: ["Amaro Lucano"],
    name: "Amaro Lucano",
    sectionSlug: "amaro-digestivi",
    drinkType: "pour",
    delete: true,
  },
  {
    matchNames: ["Sambuca Molinari"],
    name: "Sambuca Molinari",
    sectionSlug: "amaro-digestivi",
    drinkType: "pour",
    delete: true,
  },
  {
    matchNames: ["Mirto Rosso"],
    name: "Mirto Rosso",
    sectionSlug: "amaro-digestivi",
    drinkType: "pour",
    delete: true,
  },
  {
    matchNames: ["Grappa"],
    name: "Grappa",
    sectionSlug: "amaro-digestivi",
    drinkType: "pour",
    delete: true,
  },
  {
    matchNames: ["Grappa Barricata 1903 Mezzaluna", "Grappa Barricata"],
    name: "Grappa Barricata 1903 Mezzaluna",
    sectionSlug: "amaro-digestivi",
    drinkType: "pour",
    delete: true,
  },
];

async function ensureInventory(existing) {
  const byName = new Map(
    existing
      .filter((row) => String(row.Name || "").trim())
      .map((row) => [String(row.Name).trim().toLowerCase(), row]),
  );
  const idByName = new Map();

  for (const item of INVENTORY) {
    const key = item.name.toLowerCase();
    const fields = {
      Name: item.name,
      Kind: item.kind,
      "Default unit": item.defaultUnit || null,
      Active: true,
    };
    if (item.abv) fields.ABV = item.abv;
    if (item.fullName) fields["Full name"] = item.fullName;
    if (item.estimatedCost != null) fields["Estimated cost"] = item.estimatedCost;
    const hit =
      byName.get(key) ||
      (item.matchNames || [])
        .map((alias) => byName.get(String(alias).trim().toLowerCase()))
        .find(Boolean);
    if (hit) {
      if (!dryRun) {
        await baserow(
          `/api/database/rows/table/${inventoryTableId}/${hit.id}/?user_field_names=true`,
          { method: "PATCH", body: JSON.stringify(fields) },
        );
      }
      idByName.set(item.name, hit.id);
      console.log(`  inv update  ${item.name}`);
    } else {
      if (!dryRun) {
        const created = await baserow(
          `/api/database/rows/table/${inventoryTableId}/?user_field_names=true`,
          { method: "POST", body: JSON.stringify(fields) },
        );
        idByName.set(item.name, created.id);
      } else {
        idByName.set(item.name, `dry:${item.name}`);
      }
      console.log(`  inv create  ${item.name}`);
    }
  }

  // Deactivate empty placeholders
  for (const row of existing) {
    if (!String(row.Name || "").trim() && row.Active !== false) {
      if (!dryRun) {
        await baserow(
          `/api/database/rows/table/${inventoryTableId}/${row.id}/?user_field_names=true`,
          { method: "PATCH", body: JSON.stringify({ Active: false }) },
        );
      }
      console.log(`  inv deactivate empty #${row.id}`);
    }
  }

  return idByName;
}

async function ensureSection({ title, slug, subtitle, order, parentId }) {
  const existing = (await listRows(sectionsTableId)).find(
    (row) => String(row.Slug || "").trim() === slug,
  );
  const fields = {
    Name: title,
    Slug: slug,
    Subtitle: subtitle || "",
    Order: order,
    Parent: parentId ? [parentId] : [],
  };
  if (existing) {
    if (!dryRun) {
      await baserow(
        `/api/database/rows/table/${sectionsTableId}/${existing.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify(fields) },
      );
    }
    return existing.id;
  }
  if (dryRun) return `dry:${slug}`;
  const created = await baserow(
    `/api/database/rows/table/${sectionsTableId}/?user_field_names=true`,
    { method: "POST", body: JSON.stringify(fields) },
  );
  console.log(`  section create ${title}`);
  return created.id;
}

async function replaceIngredients(itemId, ingredients, invIds) {
  const existing = await listRows(ingredientsTableId);
  const mine = existing.filter((row) => Number(linkId(row["Menu Item"])) === Number(itemId));
  for (const row of mine) {
    if (!dryRun) {
      await baserow(`/api/database/rows/table/${ingredientsTableId}/${row.id}/`, {
        method: "DELETE",
      });
    }
  }
  let order = 0;
  for (const ing of ingredients || []) {
    order += 1;
    const inventoryId = invIds.get(ing.inventoryName || ing.name);
    const fields = {
      Name: ing.name,
      "Menu Item": [Number(itemId)],
      Qty: ing.quantity ?? null,
      Unit: ing.unit || null,
      Note: ing.note || "",
      ABV: "",
      Order: order,
      Inventory: inventoryId && !String(inventoryId).startsWith("dry:") ? [Number(inventoryId)] : [],
    };
    if (!dryRun) {
      await baserow(
        `/api/database/rows/table/${ingredientsTableId}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(fields) },
      );
    }
  }
}

async function upsertMenuItem(def, sectionIdBySlug, itemsByName, invIds) {
  const sectionId = sectionIdBySlug.get(def.sectionSlug);
  if (!sectionId) {
    throw new Error(`Missing section ${def.sectionSlug} for ${def.name}`);
  }

  let hit = null;
  for (const alias of def.matchNames) {
    hit = itemsByName.get(alias.toLowerCase());
    if (hit) break;
  }

  if (def.delete) {
    if (!hit) {
      console.log(`  skip delete (missing) ${def.name}`);
      return;
    }
    if (!dryRun) {
      const existingIngs = await listRows(ingredientsTableId);
      for (const row of existingIngs) {
        if (Number(linkId(row["Menu Item"])) === Number(hit.id)) {
          await baserow(`/api/database/rows/table/${ingredientsTableId}/${row.id}/`, {
            method: "DELETE",
          });
        }
      }
      await baserow(`/api/database/rows/table/${itemsTableId}/${hit.id}/`, {
        method: "DELETE",
      });
    }
    console.log(`  delete ${def.name}`);
    itemsByName.delete(String(hit.Name || "").toLowerCase());
    return;
  }

  const fields = {
    Name: def.name,
    Section: [Number(sectionId)],
    "Menu line": def.description || "",
    "Lock menu line": Boolean(def.lockDescription),
    Price: def.price || "",
    "Alt price": def.priceAlt || "",
    "Drink type": def.drinkType,
    "Cocktail type": cocktailTypeFor(def) || null,
    Type: def.notes || "",
    ABV: def.abv || "",
    Volume: def.volume || "",
    Producer: def.producer || "",
    "On digital menu": def.onDigitalMenu !== false,
    Method: "",
    Glassware: "",
    Garnish: "",
    Ice: "",
    Signature: false,
  };
  if (def.order != null) fields.Order = def.order;

  let itemId;
  if (hit) {
    itemId = hit.id;
    if (!dryRun) {
      await baserow(
        `/api/database/rows/table/${itemsTableId}/${hit.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify(fields) },
      );
    }
    // Refresh name key if renamed
    itemsByName.delete(String(hit.Name || "").toLowerCase());
    itemsByName.set(def.name.toLowerCase(), { ...hit, Name: def.name, id: hit.id });
    console.log(`  update ${def.name} (${(def.ingredients || []).length} ings)`);
  } else {
    if (!dryRun) {
      const siblings = await listRows(itemsTableId);
      const maxOrder = siblings.reduce((max, row) => {
        const order = Number(row.Order) || 0;
        return order > max ? order : max;
      }, 0);
      if (def.order == null) fields.Order = maxOrder + 1;
      const created = await baserow(
        `/api/database/rows/table/${itemsTableId}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(fields) },
      );
      itemId = created.id;
      itemsByName.set(def.name.toLowerCase(), { id: created.id, Name: def.name });
    } else {
      itemId = `dry:${def.name}`;
    }
    console.log(`  create ${def.name} (${(def.ingredients || []).length} ings)`);
  }

  if (def.ingredients) {
    await replaceIngredients(itemId, def.ingredients, invIds);
  }
}

async function main() {
  const tables = await requireOpsTables();
  sectionsTableId = tables.sections;
  itemsTableId = tables.items;
  ingredientsTableId = tables.ingredients;
  inventoryTableId = tables.inventory;
  if (!inventoryTableId) {
    throw new Error('Baserow table "Inventory" not found. Run npm run setup:baserow-ops.');
  }
  console.log(dryRun ? "Dry run…\n" : "Seeding ops print menu…\n");

  console.log("Inventory…");
  const invRows = await listRows(inventoryTableId);
  const invIds = await ensureInventory(invRows);

  console.log("\nSections…");
  const sectionIdBySlug = new Map();
  let order = 0;
  for (const chapter of PRINT_MENU_CHAPTERS) {
    order += 1;
    const chapterId = await ensureSection({
      title: chapter.title,
      slug: chapter.slug,
      subtitle: chapter.subtitle,
      order,
    });
    sectionIdBySlug.set(chapter.slug, chapterId);
    for (const sub of chapter.subsections || []) {
      order += 1;
      const subId = await ensureSection({
        title: sub.title,
        slug: sub.slug,
        order,
        parentId: chapterId,
      });
      sectionIdBySlug.set(sub.slug, subId);
    }
  }

  console.log("\nMenu items + recipes…");
  const itemRows = await listRows(itemsTableId);
  const itemsByName = new Map(
    itemRows
      .filter((row) => String(row.Name || "").trim())
      .map((row) => [String(row.Name).trim().toLowerCase(), row]),
  );

  for (const def of MENU_UPDATES) {
    await upsertMenuItem(def, sectionIdBySlug, itemsByName, invIds);
  }

  console.log("\nObsolete sections…");
  const leftoverItems = await listRows(itemsTableId);
  const usedSectionIds = new Set(
    leftoverItems
      .map((row) => Number(linkId(row.Section)))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  const leftoverSections = await listRows(sectionsTableId);
  for (const row of leftoverSections) {
    const slug = String(row.Slug || "").trim();
    if (!slug || PRINT_MENU_SECTION_SLUGS.has(slug)) continue;
    if (usedSectionIds.has(Number(row.id))) {
      console.log(`  keep ${slug} (still has items)`);
      continue;
    }
    if (!dryRun) {
      await baserow(`/api/database/rows/table/${sectionsTableId}/${row.id}/`, {
        method: "DELETE",
      });
    }
    console.log(`  delete section ${row.Name || slug}`);
  }

  console.log(dryRun ? "\nDry run complete." : "\nDone.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
