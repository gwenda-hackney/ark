import { describe, expect, it } from "vitest";
import {
  formatMenuPrice,
  menuPriceList,
  menuPrices,
  type MenuItem,
} from "./menu";

const drink = (fields: Partial<MenuItem>): MenuItem => ({
  id: "x",
  name: "Drink",
  ...fields,
});

describe("menu prices", () => {
  it("shows one price beside the name", () => {
    expect(formatMenuPrice(drink({ price: "14" }))).toBe("14");
    expect(
      formatMenuPrice(drink({ prices: [{ name: "Single", price: "14" }] })),
    ).toBe("14");
    expect(menuPriceList(drink({ price: "14" }))).toEqual([]);
  });

  it("shows two prices beside the name, as before", () => {
    expect(formatMenuPrice(drink({ price: "8", priceAlt: "10" }))).toBe(
      "8 / 10",
    );
    expect(
      formatMenuPrice(
        drink({
          price: "8",
          priceAlt: "10",
          prices: [
            { name: "Single", size: "25 ml", price: "8" },
            { name: "Double", size: "50 ml", price: "10" },
          ],
        }),
      ),
    ).toBe("8 / 10");
  });

  it("lists three or more with their names on their own line", () => {
    const wine = drink({
      price: "7",
      priceAlt: "9",
      prices: [
        { name: "125 ml", size: "125 ml", price: "7" },
        { name: "175 ml", size: "175 ml", price: "9" },
        { name: "250 ml", size: "250 ml", price: "12" },
        { name: "Bottle", price: "34" },
      ],
    });
    expect(formatMenuPrice(wine)).toBe("");
    expect(
      menuPriceList(wine).map((row) => `${row.name} ${row.price}`),
    ).toEqual(["125 ml 7", "175 ml 9", "250 ml 12", "Bottle 34"]);
  });

  it("falls back to the two old fields for a drink published before the list", () => {
    expect(menuPrices(drink({ priceAlt: "10" }))).toEqual([
      { name: "", price: "10" },
    ]);
    expect(menuPrices(drink({ prices: [], price: "6" }))).toEqual([
      { name: "", price: "6" },
    ]);
    expect(menuPrices(drink({}))).toEqual([]);
  });
});
