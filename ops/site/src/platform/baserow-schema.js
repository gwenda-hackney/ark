/**
 * Field definitions for the Gwenda Ops Baserow tables: the bodies
 * ops/site/scripts/setup-baserow.mjs sends to create each field. Pure data, safe to import
 * (unlike the setup script), so the test fake (ops/site/src/testing/)
 * builds the same schema. Inventory and supplier tables still live in the
 * setup script; move them here when their tests need them.
 */

export function eventFields() {
  return [
    { name: "Artist", body: { name: "Artist", type: "text" } },
    { name: "Offer", body: { name: "Offer", type: "text" } },
    { name: "Page link", body: { name: "Page link", type: "url" } },
    {
      name: "Short description",
      body: { name: "Short description", type: "long_text" },
    },
    { name: "Description", body: { name: "Description", type: "long_text" } },
    {
      name: "Operations notes",
      body: { name: "Operations notes", type: "long_text" },
    },
    { name: "Image links", body: { name: "Image links", type: "long_text" } },
    {
      name: "Starts on",
      body: {
        name: "Starts on",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    { name: "Time", body: { name: "Time", type: "text" } },
    { name: "Start time", body: { name: "Start time", type: "text" } },
    { name: "End time", body: { name: "End time", type: "text" } },
    {
      name: "Night schedule",
      body: { name: "Night schedule", type: "long_text" },
    },
    {
      name: "Repeat every",
      body: {
        name: "Repeat every",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    {
      name: "Repeat unit",
      body: {
        name: "Repeat unit",
        type: "single_select",
        select_options: [
          { value: "none", color: "gray" },
          { value: "once", color: "yellow" },
          { value: "day", color: "blue" },
          { value: "week", color: "green" },
          { value: "month", color: "purple" },
        ],
      },
    },
    { name: "Weekdays", body: { name: "Weekdays", type: "text" } },
    {
      name: "Month day",
      body: {
        name: "Month day",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    {
      name: "Ends on",
      body: {
        name: "Ends on",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    {
      name: "Skipped dates",
      body: { name: "Skipped dates", type: "long_text" },
    },
    {
      name: "Extra dates",
      body: { name: "Extra dates", type: "long_text" },
    },
    { name: "Slug", body: { name: "Slug", type: "text" } },
    {
      name: "Former slugs",
      body: { name: "Former slugs", type: "long_text" },
    },
    { name: "Deleted at", body: { name: "Deleted at", type: "text" } },
    {
      name: "Taking applications",
      body: { name: "Taking applications", type: "boolean" },
    },
    { name: "Drive folder id", body: { name: "Drive folder id", type: "text" } },
    {
      name: "Replaces series",
      body: { name: "Replaces series", type: "text" },
    },
    // The Sanity asset id of the main image (#183). Main image is the old copy.
    { name: "Hero asset", body: { name: "Hero asset", type: "text" } },
    { name: "Main image", body: { name: "Main image", type: "file" } },
    {
      name: "Hero crops",
      body: { name: "Hero crops", type: "long_text" },
    },
    { name: "Images", body: { name: "Images", type: "file" } },
    // Gallery photos as JSON (#183): Sanity asset ids, newest first.
    { name: "Gallery", body: { name: "Gallery", type: "long_text" } },
  ];
}

export function eventDateFields(eventsTableId) {
  return [
    {
      name: "Event",
      body: {
        name: "Event",
        type: "link_row",
        link_row_table_id: eventsTableId,
      },
    },
    {
      name: "Date",
      body: {
        name: "Date",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    { name: "Slug", body: { name: "Slug", type: "text" } },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
    {
      name: "ClickUp Task ID",
      body: { name: "ClickUp Task ID", type: "text" },
    },
    {
      name: "Title override",
      body: { name: "Title override", type: "text" },
    },
    {
      name: "Artist override",
      body: { name: "Artist override", type: "text" },
    },
    { name: "Offer override", body: { name: "Offer override", type: "text" } },
    {
      name: "Page link override",
      body: { name: "Page link override", type: "url" },
    },
    {
      name: "Description override",
      body: { name: "Description override", type: "long_text" },
    },
    {
      name: "Short description override",
      body: { name: "Short description override", type: "long_text" },
    },
    { name: "Time override", body: { name: "Time override", type: "text" } },
    {
      name: "Start time override",
      body: { name: "Start time override", type: "text" },
    },
    {
      name: "End time override",
      body: { name: "End time override", type: "text" },
    },
    {
      name: "Night schedule override",
      body: { name: "Night schedule override", type: "long_text" },
    },
    {
      name: "Operations notes override",
      body: { name: "Operations notes override", type: "long_text" },
    },
    {
      name: "Image links override",
      body: { name: "Image links override", type: "long_text" },
    },
    { name: "Override asset", body: { name: "Override asset", type: "text" } },
    { name: "Override image", body: { name: "Override image", type: "file" } },
    {
      name: "Override hero crops",
      body: { name: "Override hero crops", type: "long_text" },
    },
    {
      name: "Publish snapshots",
      body: { name: "Publish snapshots", type: "long_text" },
    },
    {
      name: "Google calendar event id",
      body: { name: "Google calendar event id", type: "text" },
    },
  ];
}

export function artistFields() {
  return [
    {
      name: "Slot",
      body: {
        name: "Slot",
        type: "single_select",
        select_options: [
          { value: "current", color: "green" },
          { value: "next", color: "blue" },
          { value: "previous", color: "gray" },
        ],
      },
    },
    { name: "Artist name", body: { name: "Artist name", type: "text" } },
    { name: "Start month", body: { name: "Start month", type: "text" } },
    { name: "End month", body: { name: "End month", type: "text" } },
    { name: "Website", body: { name: "Website", type: "url" } },
    { name: "Profile", body: { name: "Profile", type: "long_text" } },
    { name: "Bio", body: { name: "Bio", type: "long_text" } },
    { name: "Portrait", body: { name: "Portrait", type: "file" } },
    { name: "Art", body: { name: "Art", type: "file" } },
    { name: "Gwenda photos", body: { name: "Gwenda photos", type: "file" } },
  ];
}

export function userFields() {
  return [
    { name: "Email", body: { name: "Email", type: "email" } },
    { name: "Active", body: { name: "Active", type: "boolean" } },
  ];
}

/** Units a recipe line can use (Ingredients and Inventory). */
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

export function sectionFields(sectionsTableId) {
  return [
    { name: "Slug", body: { name: "Slug", type: "text" } },
    { name: "Subtitle", body: { name: "Subtitle", type: "text" } },
    {
      name: "Parent",
      body: {
        name: "Parent",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
  ];
}

export function itemFields(sectionsTableId, posMenusTableId) {
  return [
    {
      name: "Section",
      body: {
        name: "Section",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    { name: "Menu line", body: { name: "Menu line", type: "long_text" } },
    {
      name: "Lock menu line",
      body: { name: "Lock menu line", type: "boolean" },
    },
    { name: "Price", body: { name: "Price", type: "text" } },
    { name: "Alt price", body: { name: "Alt price", type: "text" } },
    // Every price as JSON (menu/prices.js); Price / Alt price are its first two rows.
    { name: "Prices", body: { name: "Prices", type: "long_text" } },
    {
      name: "Drink type",
      body: {
        name: "Drink type",
        type: "single_select",
        select_options: [
          { value: "cocktail", color: "purple" },
          { value: "pour", color: "orange" },
          { value: "beer", color: "yellow" },
          { value: "packaged", color: "cyan" },
          { value: "postmix", color: "light-blue" },
        ],
      },
    },
    {
      name: "Cocktail type",
      body: {
        name: "Cocktail type",
        type: "single_select",
        select_options: [
          { value: "spritz", color: "pink" },
          { value: "highball", color: "blue" },
          { value: "sour", color: "yellow" },
          { value: "stirred", color: "dark-gray" },
          { value: "negroni", color: "orange" },
          { value: "fizz", color: "cyan" },
          { value: "other", color: "light-gray" },
        ],
      },
    },
    { name: "Type", body: { name: "Type", type: "text" } },
    { name: "Glassware", body: { name: "Glassware", type: "text" } },
    { name: "Garnish", body: { name: "Garnish", type: "text" } },
    { name: "Ice", body: { name: "Ice", type: "text" } },
    { name: "Method", body: { name: "Method", type: "long_text" } },
    { name: "Signature", body: { name: "Signature", type: "boolean" } },
    { name: "ABV", body: { name: "ABV", type: "text" } },
    { name: "Volume", body: { name: "Volume", type: "text" } },
    // On: ABV / Volume was set by hand and a save keeps it. Off: it follows the
    // recipe (menu/metric-override.js).
    { name: "ABV override", body: { name: "ABV override", type: "boolean" } },
    { name: "Volume override", body: { name: "Volume override", type: "boolean" } },
    { name: "Producer", body: { name: "Producer", type: "text" } },
    { name: "Photo", body: { name: "Photo", type: "file" } },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
    {
      name: "On digital menu",
      body: { name: "On digital menu", type: "boolean" },
    },
    {
      name: "On print menu",
      body: { name: "On print menu", type: "boolean" },
    },
    {
      name: "Publish snapshots",
      body: { name: "Publish snapshots", type: "long_text" },
    },
    {
      name: "AI reading",
      body: { name: "AI reading", type: "long_text" },
    },
    { name: "Lightspeed SKU", body: { name: "Lightspeed SKU", type: "text" } },
    {
      name: "Lightspeed SKU alt",
      body: { name: "Lightspeed SKU alt", type: "text" },
    },
    {
      name: "Lightspeed name",
      body: { name: "Lightspeed name", type: "text" },
    },
    {
      name: "Lightspeed menu/screen",
      body: { name: "Lightspeed menu/screen", type: "text" },
    },
    {
      name: "Lightspeed status",
      body: {
        name: "Lightspeed status",
        type: "single_select",
        select_options: [
          { value: "matched", color: "green" },
          { value: "mismatch", color: "orange" },
          { value: "missing", color: "red" },
        ],
      },
    },
    {
      name: "POS menus",
      body: posMenusTableId
        ? {
            name: "POS menus",
            type: "link_row",
            link_row_table_id: posMenusTableId,
            has_related_field: false,
          }
        : null,
    },
  ];
}

export function posMenuFields() {
  return [
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Default", body: { name: "Default", type: "boolean" } },
  ];
}

export function menuPlacementFields(itemsTableId, sectionsTableId, posMenusTableId) {
  return [
    {
      name: "Menu item",
      body: {
        name: "Menu item",
        type: "link_row",
        link_row_table_id: itemsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Channel",
      body: {
        name: "Channel",
        type: "single_select",
        select_options: [
          { value: "print", color: "orange" },
          { value: "digital", color: "blue" },
          { value: "pos", color: "green" },
        ],
      },
    },
    {
      name: "Section",
      body: {
        name: "Section",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    {
      name: "POS menu",
      body: {
        name: "POS menu",
        type: "link_row",
        link_row_table_id: posMenusTableId,
        has_related_field: false,
      },
    },
    { name: "POS screen", body: { name: "POS screen", type: "text" } },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
  ];
}

export function ingredientFields(itemsTableId, inventoryTableId) {
  return [
    {
      name: "Menu Item",
      body: {
        name: "Menu Item",
        type: "link_row",
        link_row_table_id: itemsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Inventory",
      body: inventoryTableId
        ? {
            name: "Inventory",
            type: "link_row",
            link_row_table_id: inventoryTableId,
            has_related_field: false,
          }
        : null,
    },
    {
      name: "Qty",
      body: {
        name: "Qty",
        type: "number",
        number_decimal_places: 2,
        number_negative: false,
      },
    },
    {
      name: "Unit",
      body: {
        name: "Unit",
        type: "single_select",
        select_options: RECIPE_UNITS.map((value, index) => ({
          value,
          color: ["blue", "green", "orange", "purple", "cyan"][index % 5],
        })),
      },
    },
    { name: "Note", body: { name: "Note", type: "text" } },
    { name: "ABV", body: { name: "ABV", type: "text" } },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
  ];
}
