/**
 * Field definitions for the Gwenda Ops Baserow tables: the bodies
 * ops/site/scripts/setup-baserow.mjs sends to create each field. Pure data, safe to import
 * (unlike the setup script), so the test fake (ops/site/src/testing/)
 * builds the same schema. Menu and inventory tables still live in the setup
 * script; move them here when their tests need them.
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
    { name: "Drive folder id", body: { name: "Drive folder id", type: "text" } },
    {
      name: "Replaces series",
      body: { name: "Replaces series", type: "text" },
    },
    { name: "Main image", body: { name: "Main image", type: "file" } },
    {
      name: "Hero crops",
      body: { name: "Hero crops", type: "long_text" },
    },
    { name: "Images", body: { name: "Images", type: "file" } },
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
