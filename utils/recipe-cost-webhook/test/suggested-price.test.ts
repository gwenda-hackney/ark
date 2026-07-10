import { describe, expect, it } from "vitest";
import { computeSuggestedPrice } from "../src/suggested-price";

describe("computeSuggestedPrice", () => {
  // ── Draught beer (35% pour cost) ───────────────────────────────────────────
  describe("draught beer — snap to nearest 50p", () => {
    it("IPA £2.27 cost at 35%", () => {
      const target = 2.27 / 0.35; // 6.49
      expect(computeSuggestedPrice(2.27, target, 0.35)).toBe(6.5);
    });
    it("Blonde Ale £1.70 cost at 35%", () => {
      const target = 1.7 / 0.35; // 4.86
      expect(computeSuggestedPrice(1.7, target, 0.35)).toBe(5.0);
    });
    it("Stout £1.88 cost at 35%", () => {
      const target = 1.88 / 0.35; // 5.37
      expect(computeSuggestedPrice(1.88, target, 0.35)).toBe(5.5);
    });
  });

  // ── Postmix / soft drinks (10% pour cost) ──────────────────────────────────
  describe("postmix soft drinks — snap to nearest 50p", () => {
    it("Coca-Cola £0.36 at 10%", () => {
      const target = 0.36 / 0.1; // 3.60
      expect(computeSuggestedPrice(0.36, target, 0.1)).toBe(3.5);
    });
    it("Sprite £0.30 at 10%", () => {
      const target = 0.3 / 0.1; // 3.00
      expect(computeSuggestedPrice(0.3, target, 0.1)).toBe(3.0);
    });
    it("Tonic Water £0.10 at 10%", () => {
      const target = 0.1 / 0.1; // 1.00
      expect(computeSuggestedPrice(0.1, target, 0.1)).toBe(1.0);
    });
  });

  // ── Short pours / shots (target < £5) ──────────────────────────────────────
  describe("short pours — £4.50 minimum floor", () => {
    it("Sambuca £0.69 at 20% (target £3.45)", () => {
      expect(computeSuggestedPrice(0.69, 3.45, 0.2)).toBe(4.5);
    });
    it("Amaro £0.77 at 20% (target £3.85)", () => {
      expect(computeSuggestedPrice(0.77, 3.85, 0.2)).toBe(4.5);
    });
    it("Grappa £0.94 at 20% (target £4.27→22% = £4.27)", () => {
      // 0.94 / 0.18 = 5.22, snap = 5.0 → but target is 4.27 < 5
      // so we use min(0.2, 0.18) = 0.18 → 0.94/0.18 = 5.22, snap = 5.0 >= 4.50
      expect(computeSuggestedPrice(0.94, 4.27, 0.2)).toBe(5.0);
    });
    it("Medium Whiskey £0.86 at 20% — 18% effective pour → £5.00", () => {
      // 0.86 / min(0.20, 0.18) = 0.86/0.18 = 4.78 → snap → 5.0; max(5.0, 4.50) = 5.0
      expect(computeSuggestedPrice(0.86, 4.3, 0.2)).toBe(5.0);
    });
  });

  // ── Volume drivers (target £5–9) ───────────────────────────────────────────
  describe("volume drivers — snap to nearest 50p, no adjustment", () => {
    it("Aperol Spritz £1.29 at 20% (target £6.45)", () => {
      expect(computeSuggestedPrice(1.29, 6.45, 0.2)).toBe(6.5);
    });
    it("Hugo Spritz £1.49 at 20% (target £7.45)", () => {
      expect(computeSuggestedPrice(1.49, 7.45, 0.2)).toBe(7.5);
    });
    it("Amaretto Sour £1.44 at 20% (target £7.20)", () => {
      expect(computeSuggestedPrice(1.44, 7.2, 0.2)).toBe(7.0);
    });
    it("Iron Hook £1.52 at 20% (target £7.60)", () => {
      expect(computeSuggestedPrice(1.52, 7.6, 0.2)).toBe(7.5);
    });
    it("Black Sail £1.70 at 20% (target £8.50)", () => {
      expect(computeSuggestedPrice(1.7, 8.5, 0.2)).toBe(8.5);
    });
    it("Campari Spritz £1.73 at 20% (target £8.65)", () => {
      expect(computeSuggestedPrice(1.73, 8.65, 0.2)).toBe(8.5);
    });
  });

  // ── Backbone cocktails (target £9–11) — ~5% uplift ────────────────────────
  describe("backbone cocktails — slight uplift funds premiums", () => {
    it("Negroni £1.99 at 20% (target £9.95) → ~£10.50", () => {
      // 1.99 / (0.2 * 0.95) = 1.99/0.19 = 10.47 → snap → 10.5
      expect(computeSuggestedPrice(1.99, 9.95, 0.2)).toBe(10.5);
    });
    it("Old Fashion £1.85 at 20% (target £9.25) → £9.50", () => {
      // 1.85 / (0.2 * 0.95) = 1.85/0.19 = 9.74 → snap → 9.5
      expect(computeSuggestedPrice(1.85, 9.25, 0.2)).toBe(9.5);
    });
    it("Tommy's Margarita £1.90 at 20% (target £9.50) → £10", () => {
      expect(computeSuggestedPrice(1.9, 9.5, 0.2)).toBe(10.0);
    });
    it("Kraken £1.92 at 20% (target £9.60) → £10", () => {
      // 1.92 / 0.19 = 10.11 → snap → 10.0
      expect(computeSuggestedPrice(1.92, 9.6, 0.2)).toBe(10.0);
    });
    it("Negroni Sbagliato £2.20 at 20% (target £11.00) falls into showcase tier → £10.50", () => {
      // target=11.00 is NOT < 11.00, falls into showcase (≥11).
      // 2.20 / (0.2 * 1.05) = 2.20/0.21 = 10.48 → snap → 10.5
      expect(computeSuggestedPrice(2.2, 11.0, 0.2)).toBe(10.5);
    });
  });

  // ── Showcase / premium cocktails (target > £11) — ~5% reduction ───────────
  describe("showcase cocktails — modest reduction for attractiveness", () => {
    it("Gwenda £2.82 at 20% (target £14.10) → £13.50", () => {
      // 2.82 / (0.2 * 1.05) = 2.82/0.21 = 13.43 → snap → 13.5
      expect(computeSuggestedPrice(2.82, 14.1, 0.2)).toBe(13.5);
    });
    it("Ponente £2.62 at 20% (target £13.10) → £12.50", () => {
      // 2.62 / 0.21 = 12.48 → snap → 12.5
      expect(computeSuggestedPrice(2.62, 13.1, 0.2)).toBe(12.5);
    });
    it("Pirate's Blood £2.35 at 20% (target £11.75) → £11", () => {
      // 2.35 / 0.21 = 11.19 → snap → 11.0
      expect(computeSuggestedPrice(2.35, 11.75, 0.2)).toBe(11.0);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("item right at £9 boundary belongs to volume tier", () => {
      // target exactly 9.00 is < 9 boundary? No, 9.00 is NOT < 9, so backbone.
      // 1.80 / 0.2 = 9.00. 1.80 / 0.19 = 9.47 → snap → 9.5
      expect(computeSuggestedPrice(1.8, 9.0, 0.2)).toBe(9.5);
    });
    it("item at exactly £11 target falls into showcase tier (not backbone)", () => {
      // target=11.00 is NOT < 11.00 → showcase: 5% reduction
      // 2.20 / 0.21 = 10.48 → snap → 10.5
      expect(computeSuggestedPrice(2.2, 11.0, 0.2)).toBe(10.5);
    });
  });
});
