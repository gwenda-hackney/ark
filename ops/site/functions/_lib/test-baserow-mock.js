/**
 * Shared Baserow catalog mock helpers for ops unit tests.
 */
export function opsCatalogTables(databaseId = 9) {
  return [
    { id: 1, name: "Menu Sections", database_id: databaseId },
    { id: 2, name: "Menu Items", database_id: databaseId },
    { id: 3, name: "Ingredients", database_id: databaseId },
    { id: 4, name: "Inventory", database_id: databaseId },
    { id: 5, name: "Suppliers", database_id: databaseId },
    { id: 6, name: "Inventory suppliers", database_id: databaseId },
    { id: 99, name: "Users", database_id: databaseId },
    { id: 88, name: "App Config", database_id: databaseId },
    { id: 77, name: "POS Menus", database_id: databaseId },
  ];
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Route all-tables vs row calls for mocked fetch. */
export function mockOpsBaserow(fetchMockImpl) {
  return async (input, init) => {
    const url = String(input);
    if (url.includes("/tables/all-tables/")) {
      return jsonResponse(opsCatalogTables());
    }
    return fetchMockImpl(input, init, url);
  };
}
